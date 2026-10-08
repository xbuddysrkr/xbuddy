using System;
using System.Diagnostics;
using System.IO;
using System.ServiceProcess;
using System.Windows.Forms;

namespace XBuddyPrintStation
{
    static class Uninstaller
    {
        [STAThread]
        static void Main()
        {
            DialogResult confirm = MessageBox.Show(
                "Are you sure you want to uninstall XBuddy Print Station and stop the Windows Service?",
                "XBuddy Print Station Uninstall",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Question);

            if (confirm != DialogResult.Yes) return;

            try
            {
                // 1. Stop and delete service
                StopAndDeleteService("XBuddy Print Agent");

                // 2. Remove Shortcuts
                RemoveShortcuts();

                // 3. Inform operator
                MessageBox.Show(
                    "XBuddy Print Agent service has been stopped and uninstalled successfully.\nApplication files will now be removed.",
                    "Uninstall Successful",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information);

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
            }
            catch (Exception ex)
            {
                MessageBox.Show("Uninstall error: " + ex.Message, "Uninstall Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private static void StopAndDeleteService(string serviceName)
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

            // Delete service via sc.exe
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
                    p.WaitForExit(5000);
                }
            }
            catch { }
        }
    }
}
