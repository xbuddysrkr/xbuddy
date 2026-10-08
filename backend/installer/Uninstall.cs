using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.ServiceProcess;
using System.Threading;
using System.Windows.Forms;

namespace XBuddyPrintStation
{
    static class Uninstaller
    {
        private const uint SC_MANAGER_ALL_ACCESS = 0xF003F;
        private const uint SERVICE_ALL_ACCESS = 0xF01FF;

        [DllImport("advapi32.dll", EntryPoint = "OpenSCManagerW", ExactSpelling = true, CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern IntPtr OpenSCManager(string machineName, string databaseName, uint dwAccess);

        [DllImport("advapi32.dll", EntryPoint = "OpenServiceW", ExactSpelling = true, CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern IntPtr OpenService(IntPtr hSCManager, string lpServiceName, uint dwDesiredAccess);

        [DllImport("advapi32.dll", EntryPoint = "DeleteService", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool DeleteService(IntPtr hService);

        [DllImport("advapi32.dll", EntryPoint = "CloseServiceHandle", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool CloseServiceHandle(IntPtr hSCObject);

        private static bool IsAdministrator()
        {
            using (var identity = WindowsIdentity.GetCurrent())
            {
                var principal = new WindowsPrincipal(identity);
                return principal.IsInRole(WindowsBuiltInRole.Administrator);
            }
        }

        [STAThread]
        static void Main(string[] args)
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

            // Self-elevation
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
                catch
                {
                    if (isSilent) Environment.ExitCode = 5;
                    return;
                }
            }

            if (!isSilent)
            {
                DialogResult confirm = MessageBox.Show(
                    "Are you sure you want to uninstall XBuddy Print Station and remove the Windows Service?",
                    "XBuddy Print Station Uninstall",
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Question);

                if (confirm != DialogResult.Yes) return;
            }

            try
            {
                // 1. Stop and remove Windows Service
                StopAndDeleteService("XBuddy Print Agent");

                // 2. Remove Shortcuts
                RemoveShortcuts();

                // 3. Inform operator
                if (!isSilent)
                {
                    MessageBox.Show(
                        "XBuddy Print Agent service has been stopped and uninstalled successfully.\nApplication files will now be removed.",
                        "Uninstall Successful",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Information);
                }

                // 4. Self-delete script via temporary batch file
                string installDir = AppDomain.CurrentDomain.BaseDirectory;
                string tempBat = Path.Combine(Path.GetTempPath(), "xbuddy_uninstall.bat");
                string batContent = string.Format(
                    "@echo off\r\ntimeout /t 2 /nobreak >nul\r\nrd /s /q \"{0}\"\r\ndel \"%~f0\"\r\n",
                    installDir.TrimEnd('\\'));

                File.WriteAllText(tempBat, batContent);
                ProcessStartInfo psi = new ProcessStartInfo("cmd.exe", "/c \"" + tempBat + "\"")
                {
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    WindowStyle = ProcessWindowStyle.Hidden
                };
                Process.Start(psi);
                Environment.ExitCode = 0;
            }
            catch (Exception ex)
            {
                if (!isSilent)
                {
                    MessageBox.Show("Uninstall error: " + ex.Message, "Uninstall Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
                Environment.ExitCode = 1;
            }
        }

        private static void StopAndDeleteService(string serviceName)
        {
            // 1. Stop service
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

            // 2. Kill lingering child processes from install directory
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

            // 4. Cleanup via sc.exe delete
            RunProcess("sc.exe", string.Format("delete \"{0}\"", serviceName));
        }

        private static void RemoveShortcuts()
        {
            try
            {
                string desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                string commonDesktop = Environment.GetFolderPath(Environment.SpecialFolder.CommonDesktopDirectory);
                string startMenu = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonPrograms), "XBuddy Print Station");

                string link1 = Path.Combine(desktop, "XBuddy Print Station.lnk");
                string link2 = Path.Combine(commonDesktop, "XBuddy Print Station.lnk");

                if (File.Exists(link1)) File.Delete(link1);
                if (File.Exists(link2)) File.Delete(link2);
                if (Directory.Exists(startMenu)) Directory.Delete(startMenu, true);
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
                    p.WaitForExit(8000);
                }
            }
            catch { }
        }
    }
}
