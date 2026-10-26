using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Threading;
using System.Windows.Forms;

static class Program
{
    private static Mutex mutex = null;
    private static Process agentProcess = null;
    private static NotifyIcon trayIcon = null;

    [STAThread]
    static void Main()
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        // 1. Single Instance Check via Global Mutex
        bool createdNew;
        mutex = new Mutex(true, "Global\\XBuddyPrintStation_SingleInstance_Mutex", out createdNew);

        if (!createdNew)
        {
            // Already running - open control panel and notify
            OpenBrowser("http://127.0.0.1:3001");
            MessageBox.Show(
                "XBuddy Print Station is already active and running in the background!\n\n" +
                "The Shopkeeper Control Panel has been opened in your browser at:\nhttp://127.0.0.1:3001",
                "XBuddy Print Station",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information
            );
            return;
        }

        string baseDir = AppDomain.CurrentDomain.BaseDirectory;
        string nodeExe = Path.Combine(baseDir, "runtime", "node.exe");
        if (!File.Exists(nodeExe))
        {
            nodeExe = Path.Combine(baseDir, "node.exe");
            if (!File.Exists(nodeExe))
            {
                nodeExe = "node.exe";
            }
        }

        string appScript = Path.Combine(baseDir, "app", "index.js");
        if (!File.Exists(appScript))
        {
            appScript = Path.Combine(baseDir, "index.js");
        }

        if (!File.Exists(appScript))
        {
            MessageBox.Show(
                "Could not find application files at:\n" + appScript + "\n\nPlease ensure the XBuddy Print Station package is intact.",
                "Startup Error",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error
            );
            return;
        }

        // 2. Start Agent Background Process
        try
        {
            ProcessStartInfo psi = new ProcessStartInfo();
            psi.FileName = nodeExe;
            psi.Arguments = "\"" + appScript + "\"";
            psi.WorkingDirectory = Path.GetDirectoryName(appScript);
            psi.CreateNoWindow = true;
            psi.UseShellExecute = false;
            psi.WindowStyle = ProcessWindowStyle.Hidden;

            psi.EnvironmentVariables["PORT"] = "3001";
            psi.EnvironmentVariables["CLOUD_API_URL"] = "https://xbuddy.onrender.com";

            agentProcess = Process.Start(psi);
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                "Failed to start XBuddy Print Station background service:\n" + ex.Message,
                "Process Startup Error",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error
            );
            return;
        }

        // 3. Setup System Tray Icon & Context Menu
        trayIcon = new NotifyIcon();
        trayIcon.Text = "XBuddy Print Station • Active";
        trayIcon.Icon = SystemIcons.Application;
        trayIcon.Visible = true;

        ContextMenu contextMenu = new ContextMenu();
        contextMenu.MenuItems.Add("Open Control Panel", (s, e) => OpenBrowser("http://127.0.0.1:3001"));
        contextMenu.MenuItems.Add("Check Status", (s, e) => CheckStatus());
        contextMenu.MenuItems.Add("-");
        contextMenu.MenuItems.Add("Restart Print Station", (s, e) => RestartAgent(nodeExe, appScript));
        contextMenu.MenuItems.Add("Exit", (s, e) => {
            CleanupAndExit();
            Application.Exit();
        });
        trayIcon.ContextMenu = contextMenu;
        trayIcon.DoubleClick += (s, e) => OpenBrowser("http://127.0.0.1:3001");

        // 4. Background Wait for HTTP 200 on port 3001, then auto-open browser
        ThreadPool.QueueUserWorkItem((state) =>
        {
            bool healthy = false;
            for (int i = 0; i < 20; i++)
            {
                Thread.Sleep(500);
                try
                {
                    HttpWebRequest request = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:3001/status");
                    request.Timeout = 2000;
                    using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
                    {
                        if (response.StatusCode == HttpStatusCode.OK)
                        {
                            healthy = true;
                            break;
                        }
                    }
                }
                catch { }
            }

            if (healthy)
            {
                OpenBrowser("http://127.0.0.1:3001");
                trayIcon.ShowBalloonTip(
                    3000,
                    "XBuddy Print Station Ready",
                    "Print Station is online and listening on http://127.0.0.1:3001",
                    ToolTipIcon.Info
                );
            }
        });

        Application.ApplicationExit += (s, e) => CleanupAndExit();
        Application.Run();
    }

    private static void OpenBrowser(string url)
    {
        try
        {
            Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
        }
        catch { }
    }

    private static void CheckStatus()
    {
        try
        {
            HttpWebRequest request = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:3001/status");
            request.Timeout = 3000;
            using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
            {
                using (StreamReader reader = new StreamReader(response.GetResponseStream()))
                {
                    string json = reader.ReadToEnd();
                    MessageBox.Show(
                        "Status Check Response:\n\n" + json,
                        "XBuddy Print Station Status",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Information
                    );
                }
            }
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                "Unable to reach local Print Station on port 3001:\n" + ex.Message,
                "Status Check",
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning
            );
        }
    }

    private static void RestartAgent(string nodeExe, string appScript)
    {
        try
        {
            if (agentProcess != null && !agentProcess.HasExited)
            {
                agentProcess.Kill();
                agentProcess.WaitForExit(3000);
            }

            ProcessStartInfo psi = new ProcessStartInfo();
            psi.FileName = nodeExe;
            psi.Arguments = "\"" + appScript + "\"";
            psi.WorkingDirectory = Path.GetDirectoryName(appScript);
            psi.CreateNoWindow = true;
            psi.UseShellExecute = false;
            psi.WindowStyle = ProcessWindowStyle.Hidden;
            psi.EnvironmentVariables["PORT"] = "3001";
            psi.EnvironmentVariables["CLOUD_API_URL"] = "https://xbuddy.onrender.com";

            agentProcess = Process.Start(psi);

            trayIcon.ShowBalloonTip(2000, "XBuddy Print Station", "Print Station restarted successfully.", ToolTipIcon.Info);
        }
        catch (Exception ex)
        {
            MessageBox.Show("Failed to restart Print Station:\n" + ex.Message, "Restart Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private static void CleanupAndExit()
    {
        try
        {
            if (trayIcon != null)
            {
                trayIcon.Visible = false;
                trayIcon.Dispose();
            }
            if (agentProcess != null && !agentProcess.HasExited)
            {
                agentProcess.Kill();
            }
            if (mutex != null)
            {
                mutex.ReleaseMutex();
            }
        }
        catch { }
    }
}
