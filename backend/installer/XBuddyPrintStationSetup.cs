using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Runtime.InteropServices;
using System.ServiceProcess;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace XBuddyPrintStation
{
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

        private const string DEFAULT_STATION_ID = "SRKR-XEROX-01";
        private const string SERVICE_NAME = "XBuddy Print Agent";

        public SetupForm(bool isSilent)
        {
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
                Text = "Windows Service & Hardware Agent Installer",
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

            // Destination Folder
            Label lblDir = new Label
            {
                Text = "Installation Directory:",
                Font = new Font("Segoe UI", 9.5f, FontStyle.Bold),
                Location = new Point(0, top),
                AutoSize = true,
                ForeColor = Color.FromArgb(226, 232, 240)
            };
            pnlContent.Controls.Add(lblDir);
            top += 25;

            string programFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
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
                        txtInstallDir.Text = Path.Combine(fbd.SelectedPath, "XBuddy Print Station");
                    }
                }
            };
            pnlContent.Controls.Add(btnBrowse);
            top += 40;

            // Station ID
            Label lblStation = new Label
            {
                Text = "Station ID (Unique Xerox identifier):",
                Font = new Font("Segoe UI", 9.5f, FontStyle.Bold),
                Location = new Point(0, top),
                AutoSize = true,
                ForeColor = Color.FromArgb(226, 232, 240)
            };
            pnlContent.Controls.Add(lblStation);
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
            top += 38;

            // Checkboxes
            chkLaunchBrowser = new CheckBox
            {
                Text = "Open Control Panel (http://127.0.0.1:3001) after install",
                Checked = true,
                Location = new Point(0, top),
                AutoSize = true,
                ForeColor = Color.FromArgb(203, 213, 225)
            };
            pnlContent.Controls.Add(chkLaunchBrowser);
            top += 26;

            chkDesktopShortcut = new CheckBox
            {
                Text = "Create Desktop Shortcut (\"XBuddy Print Station\")",
                Checked = true,
                Location = new Point(0, top),
                AutoSize = true,
                ForeColor = Color.FromArgb(203, 213, 225)
            };
            pnlContent.Controls.Add(chkDesktopShortcut);
            top += 35;

            // Progress Bar
            progressBar = new ProgressBar
            {
                Location = new Point(0, top),
                Size = new Size(565, 14),
                Style = ProgressBarStyle.Continuous,
                Value = 0
            };
            pnlContent.Controls.Add(progressBar);
            top += 20;

            lblStatus = new Label
            {
                Text = "Ready to install. Click \"Install Now\" to begin.",
                Location = new Point(0, top),
                Size = new Size(565, 20),
                ForeColor = Color.FromArgb(148, 163, 184)
            };
            pnlContent.Controls.Add(lblStatus);
            top += 25;

            // Log output
            lstLog = new ListBox
            {
                Location = new Point(0, top),
                Size = new Size(565, 115),
                BackColor = Color.FromArgb(11, 15, 25),
                ForeColor = Color.FromArgb(203, 213, 225),
                BorderStyle = BorderStyle.FixedSingle,
                Font = new Font("Consolas", 8.5f)
            };
            pnlContent.Controls.Add(lstLog);
            top += 125;

            // Action Buttons
            btnInstall = new Button
            {
                Text = "Install Now",
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
                worker.ReportProgress(10, "Creating application directory...");
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

                // 3. Write config.json
                worker.ReportProgress(50, "Saving station identity config...");
                string configPath = Path.Combine(stationDataDir, "config.json");
                string configJson = string.Format(
                    "{{\n  \"stationId\": \"{0}\",\n  \"selectedPrinter\": \"\",\n  \"cloudApiUrl\": \"https://xbuddysrkr.vercel.app\",\n  \"agentSecretKey\": \"d834c5055c2a2401ee3f59cd121f59258403156e86034eab956dc099351dd9e4\",\n  \"port\": 3001,\n  \"version\": \"2.1.0\",\n  \"autoHeartbeat\": true,\n  \"heartbeatIntervalMs\": 30000\n}}",
                    stationId);
                File.WriteAllText(configPath, configJson, Encoding.UTF8);

                // 4. Install & Register Windows Service
                worker.ReportProgress(65, "Registering Windows Service (" + SERVICE_NAME + ")...");
                string serviceBin = Path.Combine(targetDir, "XBuddyService.exe");
                
                // Stop & delete previous service if existing
                StopService(SERVICE_NAME);
                RunProcess("sc.exe", string.Format("delete \"{0}\"", SERVICE_NAME));
                Thread.Sleep(1000);

                // Create Service
                string scCreateArgs = string.Format(
                    "create \"{0}\" binPath= \"\\\"{1}\\\"\" start= auto DisplayName= \"XBuddy Print Station Agent\"",
                    SERVICE_NAME, serviceBin);
                RunProcess("sc.exe", scCreateArgs);

                // Set description
                RunProcess("sc.exe", string.Format("description \"{0}\" \"Self-contained hardware printing service for XBuddy Print Stations.\"", SERVICE_NAME));

                // Configure recovery: auto-restart on unexpected failure
                worker.ReportProgress(80, "Configuring service auto-restart recovery...");
                RunProcess("sc.exe", string.Format("failure \"{0}\" reset= 86400 actions= restart/3000/restart/5000/restart/10000", SERVICE_NAME));

                // Start service
                worker.ReportProgress(88, "Starting Windows Service...");
                RunProcess("sc.exe", string.Format("start \"{0}\"", SERVICE_NAME));

                // 5. Create Shortcuts
                worker.ReportProgress(95, "Creating desktop & start menu shortcuts...");
                CreateShortcuts(targetDir);

                worker.ReportProgress(100, "Setup complete!");
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
                                    // Directory
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
                lblStatus.Text = "Installation failed! See log for details.";
                lblStatus.ForeColor = Color.FromArgb(239, 68, 68);
                btnInstall.Enabled = true;
                btnInstall.Text = "Retry Install";
                string errMsg = e.Error != null ? e.Error.Message : (e.Result is Exception ? ((Exception)e.Result).Message : "Unknown error");
                MessageBox.Show(
                    "Setup encountered an error:\n" + errMsg,
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

            if (chkLaunchBrowser.Checked)
            {
                // Wait briefly for port 3001 to open
                ThreadPool.QueueUserWorkItem((state) =>
                {
                    Thread.Sleep(1500);
                    try { Process.Start("http://127.0.0.1:3001"); } catch { }
                });
            }
        }

        private static void StopService(string serviceName)
        {
            try
            {
                using (ServiceController sc = new ServiceController(serviceName))
                {
                    if (sc.Status != ServiceControllerStatus.Stopped && sc.Status != ServiceControllerStatus.StopPending)
                    {
                        sc.Stop();
                        sc.WaitForStatus(ServiceControllerStatus.Stopped, TimeSpan.FromSeconds(5));
                    }
                }
            }
            catch { }
        }

        private static void RunProcess(string exe, string args)
        {
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo(exe, args)
                {
                    CreateNoWindow = true,
                    UseShellExecute = false
                };
                using (Process p = Process.Start(psi))
                {
                    p.WaitForExit(10000);
                }
            }
            catch { }
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

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new SetupForm(isSilent));
        }
    }
}
