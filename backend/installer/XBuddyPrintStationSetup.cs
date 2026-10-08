using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.ServiceProcess;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace XBuddyPrintStation
{
    internal static class ServiceHelper
    {
        public const string SERVICE_NAME = "XBuddy Print Agent";
        public const string DISPLAY_NAME = "XBuddy Print Station Agent";

        private const uint SC_MANAGER_ALL_ACCESS = 0xF003F;
        private const uint SERVICE_ALL_ACCESS = 0xF01FF;
        private const uint SERVICE_WIN32_OWN_PROCESS = 0x00000010;
        private const uint SERVICE_AUTO_START = 0x00000002;
        private const uint SERVICE_ERROR_NORMAL = 0x00000001;

        [DllImport("advapi32.dll", EntryPoint = "OpenSCManagerW", ExactSpelling = true, CharSet = CharSet.Unicode, SetLastError = true)]
        public static extern IntPtr OpenSCManager(string machineName, string databaseName, uint dwAccess);

        [DllImport("advapi32.dll", EntryPoint = "OpenServiceW", ExactSpelling = true, CharSet = CharSet.Unicode, SetLastError = true)]
        public static extern IntPtr OpenService(IntPtr hSCManager, string lpServiceName, uint dwDesiredAccess);

        [DllImport("advapi32.dll", EntryPoint = "CreateServiceW", SetLastError = true, CharSet = CharSet.Unicode)]
        public static extern IntPtr CreateService(
            IntPtr hSCManager,
            string lpServiceName,
            string lpDisplayName,
            uint dwDesiredAccess,
            uint dwServiceType,
            uint dwStartType,
            uint dwErrorControl,
            string lpBinaryPathName,
            string lpLoadOrderGroup,
            IntPtr lpdwTagId,
            string lpDependencies,
            string lpServiceStartName,
            string lpPassword);

        [DllImport("advapi32.dll", EntryPoint = "DeleteService", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool DeleteService(IntPtr hService);

        [DllImport("advapi32.dll", EntryPoint = "CloseServiceHandle", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool CloseServiceHandle(IntPtr hSCObject);

        [DllImport("advapi32.dll", EntryPoint = "ChangeServiceConfigW", SetLastError = true, CharSet = CharSet.Unicode)]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool ChangeServiceConfig(
            IntPtr hService,
            uint dwServiceType,
            uint dwStartType,
            uint dwErrorControl,
            string lpBinaryPathName,
            string lpLoadOrderGroup,
            IntPtr lpdwTagId,
            string lpDependencies,
            string lpServiceStartName,
            string lpPassword,
            string lpDisplayName);

        public static int RunProcess(string exe, string args, out string stdout, out string stderr)
        {
            stdout = "";
            stderr = "";
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo(exe, args)
                {
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true
                };
                using (Process p = Process.Start(psi))
                {
                    stdout = p.StandardOutput.ReadToEnd();
                    stderr = p.StandardError.ReadToEnd();
                    p.WaitForExit(15000);
                    return p.ExitCode;
                }
            }
            catch (Exception ex)
            {
                stderr = ex.Message;
                return -1;
            }
        }

        public static void UninstallService(string serviceName)
        {
            // 1. Stop service via ServiceController if running
            try
            {
                using (ServiceController sc = new ServiceController(serviceName))
                {
                    if (sc.Status != ServiceControllerStatus.Stopped && sc.Status != ServiceControllerStatus.StopPending)
                    {
                        sc.Stop();
                        sc.WaitForStatus(ServiceControllerStatus.Stopped, TimeSpan.FromSeconds(6));
                    }
                }
            }
            catch { }

            // 2. Kill any lingering service processes
            try
            {
                foreach (var proc in Process.GetProcessesByName("XBuddyService"))
                {
                    try { proc.Kill(); proc.WaitForExit(2000); } catch { }
                }
            }
            catch { }

            // 3. Delete via Win32 API
            IntPtr scm = OpenSCManager(null, null, SC_MANAGER_ALL_ACCESS);
            if (scm != IntPtr.Zero)
            {
                try
                {
                    IntPtr svc = OpenService(scm, serviceName, SERVICE_ALL_ACCESS);
                    if (svc != IntPtr.Zero)
                    {
                        DeleteService(svc);
                        CloseServiceHandle(svc);
                    }
                }
                finally
                {
                    CloseServiceHandle(scm);
                }
            }

            // 4. Secondary cleanup via sc.exe delete
            RunCommand("sc.exe", string.Format("delete \"{0}\"", serviceName));
        }

        public static int RunCommand(string exe, string args)
        {
            string dummyOut, dummyErr;
            return RunProcess(exe, args, out dummyOut, out dummyErr);
        }

        public static void InstallService(string serviceName, string displayName, string serviceBinPath)
        {
            UninstallService(serviceName);
            Thread.Sleep(500);

            if (!File.Exists(serviceBinPath))
            {
                throw new FileNotFoundException("Service executable not found at: " + serviceBinPath);
            }

            string binPathQuoted = string.Format("\"{0}\"", serviceBinPath);
            bool created = false;

            // Method A: Direct Win32 API CreateService with idempotent handling
            IntPtr scm = OpenSCManager(null, null, SC_MANAGER_ALL_ACCESS);
            if (scm == IntPtr.Zero)
            {
                int err = Marshal.GetLastWin32Error();
                throw new InvalidOperationException(string.Format("OpenSCManager failed with error code {0}. Administrator privileges are required to install Windows Services.", err));
            }

            try
            {
                int retries = 10;
                while (retries-- > 0)
                {
                    IntPtr svc = CreateService(
                        scm,
                        serviceName,
                        displayName,
                        SERVICE_ALL_ACCESS,
                        SERVICE_WIN32_OWN_PROCESS,
                        SERVICE_AUTO_START,
                        SERVICE_ERROR_NORMAL,
                        binPathQuoted,
                        null,
                        IntPtr.Zero,
                        null,
                        null,
                        null);

                    if (svc != IntPtr.Zero)
                    {
                        created = true;
                        CloseServiceHandle(svc);
                        break;
                    }

                    int err = Marshal.GetLastWin32Error();
                    if (err == 1073) // ERROR_SERVICE_EXISTS
                    {
                        IntPtr existingSvc = OpenService(scm, serviceName, SERVICE_ALL_ACCESS);
                        if (existingSvc != IntPtr.Zero)
                        {
                            try
                            {
                                ChangeServiceConfig(
                                    existingSvc,
                                    SERVICE_WIN32_OWN_PROCESS,
                                    SERVICE_AUTO_START,
                                    SERVICE_ERROR_NORMAL,
                                    binPathQuoted,
                                    null,
                                    IntPtr.Zero,
                                    null,
                                    null,
                                    null,
                                    displayName);
                                created = true;
                            }
                            finally
                            {
                                CloseServiceHandle(existingSvc);
                            }
                            break;
                        }
                    }
                    else if (err == 1072) // ERROR_SERVICE_MARKED_FOR_DELETE
                    {
                        Thread.Sleep(500);
                        continue;
                    }
                    else
                    {
                        break;
                    }
                }
            }
            finally
            {
                CloseServiceHandle(scm);
            }

            // Method B: Fallback / complement via sc.exe create
            if (!created)
            {
                string scCreateArgs = string.Format("create \"{0}\" binPath= \"{1}\" start= auto DisplayName= \"{2}\"",
                    serviceName, serviceBinPath, displayName);
                string scOut, scErr;
                int exitCode = RunProcess("sc.exe", scCreateArgs, out scOut, out scErr);
                if (exitCode != 0 && scOut.IndexOf("already exists", StringComparison.OrdinalIgnoreCase) < 0)
                {
                    throw new InvalidOperationException(string.Format("Failed to register Windows Service via sc.exe (Exit {0}): {1} {2}",
                        exitCode, scOut.Trim(), scErr.Trim()));
                }
            }

            // Configure description
            RunCommand("sc.exe", string.Format("description \"{0}\" \"Self-contained hardware printing service for XBuddy Print Stations.\"", serviceName));

            // Configure auto-restart recovery on unexpected crash: restart after 3s, 5s, 10s (Requirement 5)
            RunCommand("sc.exe", string.Format("failure \"{0}\" reset= 86400 actions= restart/3000/restart/5000/restart/10000", serviceName));
            RunCommand("sc.exe", string.Format("failureflag \"{0}\" 1", serviceName));
        }

        public static void StartAndVerifyService(string serviceName)
        {
            // 1. Start the service
            try
            {
                using (ServiceController sc = new ServiceController(serviceName))
                {
                    if (sc.Status != ServiceControllerStatus.Running && sc.Status != ServiceControllerStatus.StartPending)
                    {
                        sc.Start();
                    }
                    sc.WaitForStatus(ServiceControllerStatus.Running, TimeSpan.FromSeconds(15));
                }
            }
            catch
            {
                // Fallback attempt via sc.exe start
                RunCommand("sc.exe", string.Format("start \"{0}\"", serviceName));
            }

            // 2. Requirement 10: Run sc.exe query "XBuddy Print Agent" and verify STATE = RUNNING
            string qOut = "";
            string qErr = "";
            for (int i = 0; i < 15; i++)
            {
                int qExit = RunProcess("sc.exe", string.Format("query \"{0}\"", serviceName), out qOut, out qErr);
                if (qExit == 0 && qOut.IndexOf("RUNNING", StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    return; // Successfully verified running
                }
                Thread.Sleep(1000);
            }

            // Secondary check with ServiceController
            try
            {
                using (ServiceController sc = new ServiceController(serviceName))
                {
                    if (sc.Status == ServiceControllerStatus.Running)
                    {
                        return; // Running
                    }
                    throw new InvalidOperationException(string.Format("Windows Service '{0}' is registered but state is '{1}' instead of RUNNING.\nsc.exe query output: {2}",
                        serviceName, sc.Status, qOut.Trim()));
                }
            }
            catch (Exception ex)
            {
                if (ex is InvalidOperationException) throw;
                throw new InvalidOperationException(string.Format("Failed to verify Windows Service '{0}': {1}\nsc.exe query output: {2} {3}",
                    serviceName, ex.Message, qOut.Trim(), qErr.Trim()));
            }
        }
    }

    public class SetupForm : Form
    {
        private TextBox txtInstallDir;
        private TextBox txtStationId;
        private CheckBox chkLaunchBrowser;
        private CheckBox chkDesktopShortcut;
        private Button btnInstall;
        private ProgressBar progressBar;
        private ListBox lstLog;
        private Label lblStatus;
        private BackgroundWorker worker;
        private bool _isSilent;

        private const string DEFAULT_STATION_ID = "SRKR-XEROX-01";
        private const string SERVICE_NAME = ServiceHelper.SERVICE_NAME;

        public SetupForm(bool isSilent)
        {
            _isSilent = isSilent;
            InitializeComponents();
            if (isSilent)
            {
                this.WindowState = FormWindowState.Minimized;
                this.ShowInTaskbar = false;
                this.Load += (s, e) => StartInstallation();
            }
        }

        private void InitializeComponents()
        {
            this.Text = "XBuddy Print Station Setup";
            this.Size = new Size(620, 640);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.BackColor = Color.FromArgb(15, 23, 42); // Slate 900
            this.ForeColor = Color.White;
            this.Font = new Font("Segoe UI", 9.5f, FontStyle.Regular);

            // Header Panel
            Panel pnlHeader = new Panel
            {
                Dock = DockStyle.Top,
                Height = 85,
                BackColor = Color.FromArgb(30, 41, 59),
                Padding = new Padding(20, 15, 20, 15)
            };

            Label lblLogo = new Label
            {
                Text = "X",
                Font = new Font("Segoe UI", 22, FontStyle.Bold),
                ForeColor = Color.White,
                BackColor = Color.FromArgb(234, 88, 12), // Orange 600
                TextAlign = ContentAlignment.MiddleCenter,
                Size = new Size(50, 50),
                Location = new Point(20, 16)
            };
            pnlHeader.Controls.Add(lblLogo);

            Label lblTitle = new Label
            {
                Text = "XBuddy Print Station Setup",
                Font = new Font("Segoe UI", 15, FontStyle.Bold),
                ForeColor = Color.White,
                AutoSize = true,
                Location = new Point(82, 17)
            };
            pnlHeader.Controls.Add(lblTitle);

            Label lblSubtitle = new Label
            {
                Text = "Windows Service & Hardware Agent Installer (v2.1.0)",
                Font = new Font("Segoe UI", 9, FontStyle.Regular),
                ForeColor = Color.FromArgb(148, 163, 184),
                AutoSize = true,
                Location = new Point(84, 46)
            };
            pnlHeader.Controls.Add(lblSubtitle);

            this.Controls.Add(pnlHeader);

            // Content Panel
            Panel pnlContent = new Panel
            {
                Location = new Point(20, 95),
                Size = new Size(565, 500)
            };

            int top = 10;

            // Station ID input
            Label lblStationId = new Label
            {
                Text = "Station ID (Hardware Identifier):",
                Location = new Point(0, top),
                AutoSize = true,
                ForeColor = Color.FromArgb(226, 232, 240)
            };
            pnlContent.Controls.Add(lblStationId);
            top += 25;

            txtStationId = new TextBox
            {
                Text = DEFAULT_STATION_ID,
                Location = new Point(0, top),
                Size = new Size(565, 26),
                BackColor = Color.FromArgb(30, 41, 59),
                ForeColor = Color.White,
                BorderStyle = BorderStyle.FixedSingle
            };
            pnlContent.Controls.Add(txtStationId);
            top += 40;

            // Install Directory
            Label lblDir = new Label
            {
                Text = "Installation Directory:",
                Location = new Point(0, top),
                AutoSize = true,
                ForeColor = Color.FromArgb(226, 232, 240)
            };
            pnlContent.Controls.Add(lblDir);
            top += 25;

            // Target Program Files (64-bit native Program Files path)
            string programFiles = Environment.GetEnvironmentVariable("ProgramW6432");
            if (string.IsNullOrEmpty(programFiles))
            {
                programFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
            }
            string defaultDir = Path.Combine(programFiles, "XBuddy Print Station");

            txtInstallDir = new TextBox
            {
                Text = defaultDir,
                Location = new Point(0, top),
                Size = new Size(465, 26),
                BackColor = Color.FromArgb(30, 41, 59),
                ForeColor = Color.White,
                BorderStyle = BorderStyle.FixedSingle
            };
            pnlContent.Controls.Add(txtInstallDir);

            Button btnBrowse = new Button
            {
                Text = "Browse...",
                Location = new Point(475, top - 1),
                Size = new Size(90, 28),
                BackColor = Color.FromArgb(51, 65, 85),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat
            };
            btnBrowse.FlatAppearance.BorderSize = 0;
            btnBrowse.Click += (s, e) =>
            {
                using (FolderBrowserDialog fbd = new FolderBrowserDialog())
                {
                    fbd.SelectedPath = txtInstallDir.Text;
                    if (fbd.ShowDialog() == DialogResult.OK)
                    {
                        txtInstallDir.Text = fbd.SelectedPath;
                    }
                }
            };
            pnlContent.Controls.Add(btnBrowse);
            top += 40;

            // Options
            chkLaunchBrowser = new CheckBox
            {
                Text = "Open Print Station Control Panel (http://127.0.0.1:3001) after setup",
                Checked = true,
                Location = new Point(0, top),
                Size = new Size(565, 24),
                ForeColor = Color.FromArgb(203, 213, 225)
            };
            pnlContent.Controls.Add(chkLaunchBrowser);
            top += 28;

            chkDesktopShortcut = new CheckBox
            {
                Text = "Create Desktop and Start Menu Shortcuts",
                Checked = true,
                Location = new Point(0, top),
                Size = new Size(565, 24),
                ForeColor = Color.FromArgb(203, 213, 225)
            };
            pnlContent.Controls.Add(chkDesktopShortcut);
            top += 35;

            // Status label
            lblStatus = new Label
            {
                Text = "Ready to install XBuddy Print Station Windows Service.",
                Location = new Point(0, top),
                Size = new Size(565, 22),
                ForeColor = Color.FromArgb(148, 163, 184)
            };
            pnlContent.Controls.Add(lblStatus);
            top += 25;

            // Progress Bar
            progressBar = new ProgressBar
            {
                Location = new Point(0, top),
                Size = new Size(565, 12),
                Style = ProgressBarStyle.Continuous
            };
            pnlContent.Controls.Add(progressBar);
            top += 20;

            // Log box
            lstLog = new ListBox
            {
                Location = new Point(0, top),
                Size = new Size(565, 130),
                BackColor = Color.FromArgb(15, 23, 42),
                ForeColor = Color.FromArgb(148, 163, 184),
                BorderStyle = BorderStyle.FixedSingle,
                Font = new Font("Consolas", 8.5f)
            };
            pnlContent.Controls.Add(lstLog);
            top += 140;

            // Install Button
            btnInstall = new Button
            {
                Text = "Install XBuddy Print Station",
                Location = new Point(0, top),
                Size = new Size(565, 42),
                BackColor = Color.FromArgb(234, 88, 12), // Orange 600
                ForeColor = Color.White,
                Font = new Font("Segoe UI", 11, FontStyle.Bold),
                FlatStyle = FlatStyle.Flat,
                Cursor = Cursors.Hand
            };
            btnInstall.FlatAppearance.BorderSize = 0;
            btnInstall.Click += (s, e) => StartInstallation();
            pnlContent.Controls.Add(btnInstall);

            this.Controls.Add(pnlContent);

            // Background worker setup
            worker = new BackgroundWorker();
            worker.WorkerReportsProgress = true;
            worker.DoWork += Worker_DoWork;
            worker.ProgressChanged += Worker_ProgressChanged;
            worker.RunWorkerCompleted += Worker_RunWorkerCompleted;
        }

        private void AddLog(string msg)
        {
            if (this.InvokeRequired)
            {
                this.Invoke(new Action<string>(AddLog), msg);
                return;
            }
            lstLog.Items.Add(msg);
            lstLog.TopIndex = lstLog.Items.Count - 1;
        }

        private void StartInstallation()
        {
            btnInstall.Enabled = false;
            txtInstallDir.Enabled = false;
            txtStationId.Enabled = false;
            btnInstall.Text = "Installing...";
            lblStatus.Text = "Extracting files and registering Windows Service...";
            lblStatus.ForeColor = Color.FromArgb(249, 115, 22);

            string targetDir = txtInstallDir.Text.Trim();
            string stationId = txtStationId.Text.Trim().ToUpper();
            if (string.IsNullOrEmpty(stationId)) stationId = DEFAULT_STATION_ID;

            worker.RunWorkerAsync(new string[] { targetDir, stationId });
        }

        private void Worker_DoWork(object sender, DoWorkEventArgs e)
        {
            string[] args = (string[])e.Argument;
            string targetDir = args[0];
            string stationId = args[1];

            try
            {
                // 1. Create Directories
                worker.ReportProgress(10, "Creating application directory: " + targetDir);
                if (!Directory.Exists(targetDir))
                {
                    Directory.CreateDirectory(targetDir);
                }

                string programData = Environment.GetEnvironmentVariable("PROGRAMDATA");
                if (string.IsNullOrEmpty(programData)) programData = @"C:\ProgramData";
                string stationDataDir = Path.Combine(programData, "XBuddyPrintStation");
                string logDir = Path.Combine(stationDataDir, "logs");
                if (!Directory.Exists(stationDataDir)) Directory.CreateDirectory(stationDataDir);
                if (!Directory.Exists(logDir)) Directory.CreateDirectory(logDir);

                // 2. Extract Embedded ZIP package
                worker.ReportProgress(25, "Extracting bundled runtime & print engine...");
                ExtractEmbeddedPackage(targetDir);

                // 3. Write / update config.json (idempotent configuration preservation)
                worker.ReportProgress(50, "Saving station identity config...");
                string configPath = Path.Combine(stationDataDir, "config.json");
                string existingKey = "";
                string existingPrinter = "";
                string existingCloudUrl = "https://xbuddysrkr.vercel.app";

                if (File.Exists(configPath))
                {
                    try
                    {
                        string existingContent = File.ReadAllText(configPath, Encoding.UTF8);
                        var matchKey = System.Text.RegularExpressions.Regex.Match(existingContent, "\"agentSecretKey\"\\s*:\\s*\"([^\"]+)\"");
                        if (matchKey.Success) existingKey = matchKey.Groups[1].Value;
                        var matchPrinter = System.Text.RegularExpressions.Regex.Match(existingContent, "\"selectedPrinter\"\\s*:\\s*\"([^\"]+)\"");
                        if (matchPrinter.Success) existingPrinter = matchPrinter.Groups[1].Value;
                        var matchCloudUrl = System.Text.RegularExpressions.Regex.Match(existingContent, "\"cloudApiUrl\"\\s*:\\s*\"([^\"]+)\"");
                        if (matchCloudUrl.Success && !string.IsNullOrEmpty(matchCloudUrl.Groups[1].Value)) existingCloudUrl = matchCloudUrl.Groups[1].Value;
                    }
                    catch { }
                }

                string agentKeyToUse = !string.IsNullOrEmpty(existingKey)
                    ? existingKey
                    : (Environment.GetEnvironmentVariable("AGENT_SECRET_KEY") ?? Provisioning.DefaultAgentKey);

                string configJson = string.Format(
                    "{{\n  \"stationId\": \"{0}\",\n  \"selectedPrinter\": \"{1}\",\n  \"cloudApiUrl\": \"{2}\",\n  \"agentSecretKey\": \"{3}\",\n  \"port\": 3001,\n  \"version\": \"2.1.0\",\n  \"autoHeartbeat\": true,\n  \"heartbeatIntervalMs\": 30000\n}}",
                    stationId, existingPrinter, existingCloudUrl, agentKeyToUse);
                File.WriteAllText(configPath, configJson, Encoding.UTF8);

                // 4. Install & Register Windows Service (Requirement 1, 2, 5, 8)
                worker.ReportProgress(65, "Registering Windows Service (" + SERVICE_NAME + ")...");
                string serviceBin = Path.Combine(targetDir, "XBuddyService.exe");
                if (!File.Exists(serviceBin))
                {
                    throw new FileNotFoundException("Service binary was not found after extraction: " + serviceBin);
                }

                ServiceHelper.InstallService(SERVICE_NAME, ServiceHelper.DISPLAY_NAME, serviceBin);

                // 5. Automatically Start & Verify Windows Service (Requirement 3, 4, 10, 11)
                worker.ReportProgress(85, "Starting and verifying Windows Service (sc.exe query)...");
                ServiceHelper.StartAndVerifyService(SERVICE_NAME);

                // 6. Create Shortcuts
                if (chkDesktopShortcut.Checked)
                {
                    worker.ReportProgress(95, "Creating desktop & start menu shortcuts...");
                    CreateShortcuts(targetDir);
                }

                worker.ReportProgress(100, "Setup complete! Windows Service is RUNNING.");
                e.Result = true;
            }
            catch (Exception ex)
            {
                worker.ReportProgress(0, "ERROR: " + ex.Message);
                e.Result = ex;
            }
        }

        private void ExtractEmbeddedPackage(string targetDir)
        {
            Assembly asm = Assembly.GetExecutingAssembly();
            string resourceName = null;
            foreach (string name in asm.GetManifestResourceNames())
            {
                if (name.EndsWith("package.zip", StringComparison.OrdinalIgnoreCase))
                {
                    resourceName = name;
                    break;
                }
            }

            if (resourceName != null)
            {
                using (Stream stream = asm.GetManifestResourceStream(resourceName))
                {
                    if (stream != null)
                    {
                        using (ZipArchive archive = new ZipArchive(stream, ZipArchiveMode.Read))
                        {
                            foreach (ZipArchiveEntry entry in archive.Entries)
                            {
                                string fullPath = Path.Combine(targetDir, entry.FullName);
                                if (string.IsNullOrEmpty(entry.Name))
                                {
                                    Directory.CreateDirectory(fullPath);
                                }
                                else
                                {
                                    Directory.CreateDirectory(Path.GetDirectoryName(fullPath));
                                    entry.ExtractToFile(fullPath, true);
                                }
                            }
                        }
                    }
                }
            }
            else
            {
                // Fallback: copy from adjacent payload folder if not embedded
                string adjacentPayload = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "payload");
                if (Directory.Exists(adjacentPayload))
                {
                    CopyDirectory(adjacentPayload, targetDir);
                }
            }
        }

        private static void CopyDirectory(string sourceDir, string targetDir)
        {
            Directory.CreateDirectory(targetDir);
            foreach (string file in Directory.GetFiles(sourceDir))
            {
                File.Copy(file, Path.Combine(targetDir, Path.GetFileName(file)), true);
            }
            foreach (string dir in Directory.GetDirectories(sourceDir))
            {
                CopyDirectory(dir, Path.Combine(targetDir, Path.GetFileName(dir)));
            }
        }

        private void Worker_ProgressChanged(object sender, ProgressChangedEventArgs e)
        {
            if (e.ProgressPercentage > 0)
            {
                progressBar.Value = Math.Min(100, e.ProgressPercentage);
            }
            if (e.UserState != null)
            {
                AddLog(e.UserState.ToString());
            }
        }

        private void Worker_RunWorkerCompleted(object sender, RunWorkerCompletedEventArgs e)
        {
            if (e.Error != null || e.Result is Exception || (e.Result is bool && !(bool)e.Result))
            {
                string errMsg = e.Error != null ? e.Error.Message : (e.Result is Exception ? ((Exception)e.Result).Message : "Unknown setup error");
                lblStatus.Text = "Installation failed! See log for details.";
                lblStatus.ForeColor = Color.FromArgb(239, 68, 68);
                btnInstall.Enabled = true;
                btnInstall.Text = "Retry Install";
                AddLog("FATAL ERROR: " + errMsg);

                if (_isSilent)
                {
                    Environment.ExitCode = 1;
                    Application.Exit();
                    return;
                }

                MessageBox.Show(
                    "Setup encountered an error:\n\n" + errMsg,
                    "Setup Error",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
                return;
            }

            lblStatus.Text = "🟢 XBuddy Print Station Installed Successfully!";
            lblStatus.ForeColor = Color.FromArgb(34, 197, 94); // Green 500
            btnInstall.Enabled = true;
            btnInstall.Text = "Finish";
            btnInstall.BackColor = Color.FromArgb(22, 163, 74);
            btnInstall.Click -= (s, ev) => StartInstallation();
            btnInstall.Click += (s, ev) => this.Close();

            if (_isSilent)
            {
                Environment.ExitCode = 0;
                Application.Exit();
                return;
            }

            if (chkLaunchBrowser.Checked)
            {
                ThreadPool.QueueUserWorkItem((state) =>
                {
                    Thread.Sleep(2000);
                    try { Process.Start("http://127.0.0.1:3001"); } catch { }
                });
            }
        }

        private static void CreateShortcuts(string targetDir)
        {
            try
            {
                string launcherExe = Path.Combine(targetDir, "XBuddyStation.exe");
                string desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                string commonDesktop = Environment.GetFolderPath(Environment.SpecialFolder.CommonDesktopDirectory);
                string startMenu = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonPrograms), "XBuddy Print Station");
                if (!Directory.Exists(startMenu)) Directory.CreateDirectory(startMenu);

                CreateWScriptShortcut(Path.Combine(desktop, "XBuddy Print Station.lnk"), launcherExe, "XBuddy Print Station Control Panel");
                CreateWScriptShortcut(Path.Combine(commonDesktop, "XBuddy Print Station.lnk"), launcherExe, "XBuddy Print Station Control Panel");
                CreateWScriptShortcut(Path.Combine(startMenu, "XBuddy Print Station.lnk"), launcherExe, "XBuddy Print Station Control Panel");
                CreateWScriptShortcut(Path.Combine(startMenu, "Uninstall XBuddy Print Station.lnk"), Path.Combine(targetDir, "Uninstall.exe"), "Uninstall XBuddy Print Station");
            }
            catch { }
        }

        private static void CreateWScriptShortcut(string shortcutPath, string targetPath, string description)
        {
            try
            {
                Type shellType = Type.GetTypeFromProgID("WScript.Shell");
                if (shellType != null)
                {
                    dynamic shell = Activator.CreateInstance(shellType);
                    dynamic shortcut = shell.CreateShortcut(shortcutPath);
                    shortcut.TargetPath = targetPath;
                    shortcut.WorkingDirectory = Path.GetDirectoryName(targetPath);
                    shortcut.Description = description;
                    shortcut.Save();
                }
            }
            catch { }
        }

        private static bool IsAdministrator()
        {
            using (var identity = WindowsIdentity.GetCurrent())
            {
                var principal = new WindowsPrincipal(identity);
                return principal.IsInRole(WindowsBuiltInRole.Administrator);
            }
        }

        [STAThread]
        public static void Main(string[] args)
        {
            bool isSilent = false;
            foreach (string arg in args)
            {
                if (arg.Equals("/S", StringComparison.OrdinalIgnoreCase) ||
                    arg.Equals("/SILENT", StringComparison.OrdinalIgnoreCase) ||
                    arg.Equals("--silent", StringComparison.OrdinalIgnoreCase))
                {
                    isSilent = true;
                }
            }

            // Self-elevation check if not running as administrator
            if (!IsAdministrator())
            {
                try
                {
                    ProcessStartInfo psi = new ProcessStartInfo
                    {
                        FileName = Assembly.GetExecutingAssembly().Location,
                        Arguments = string.Join(" ", args),
                        Verb = "runas",
                        UseShellExecute = true
                    };
                    Process p = Process.Start(psi);
                    if (isSilent)
                    {
                        p.WaitForExit();
                        Environment.ExitCode = p.ExitCode;
                    }
                    return;
                }
                catch (Exception ex)
                {
                    if (isSilent)
                    {
                        Console.Error.WriteLine("Administrator privileges required: " + ex.Message);
                        Environment.ExitCode = 5; // ERROR_ACCESS_DENIED
                        return;
                    }
                    MessageBox.Show(
                        "Administrator privileges are required to register the XBuddy Print Agent Windows Service.\n\nPlease right-click the installer and select 'Run as administrator'.",
                        "Administrator Privileges Required",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Warning);
                    return;
                }
            }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new SetupForm(isSilent));
        }
    }
}
