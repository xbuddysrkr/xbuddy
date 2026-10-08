using System;
using System.Diagnostics;
using System.Net;
using System.ServiceProcess;
using System.Threading;
using System.Windows.Forms;

namespace XBuddyPrintStation
{
    static class StationLauncher
    {
        [STAThread]
        static void Main()
        {
            try
            {
                // 1. Check if local print agent is responding
                bool isAlive = false;
                try
                {
                    HttpWebRequest request = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:3001/status");
                    request.Timeout = 1500;
                    using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
                    {
                        if (response.StatusCode == HttpStatusCode.OK)
                        {
                            isAlive = true;
                        }
                    }
                }
                catch { }

                // 2. If not alive, try starting the Windows Service
                if (!isAlive)
                {
                    try
                    {
                        using (ServiceController sc = new ServiceController("XBuddy Print Agent"))
                        {
                            if (sc.Status != ServiceControllerStatus.Running && sc.Status != ServiceControllerStatus.StartPending)
                            {
                                sc.Start();
                                sc.WaitForStatus(ServiceControllerStatus.Running, TimeSpan.FromSeconds(5));
                            }
                        }
                    }
                    catch { }

                    // Brief wait for HTTP server to bind
                    Thread.Sleep(1000);
                }

                // 3. Open browser to Control Panel
                Process.Start("http://127.0.0.1:3001");
            }
            catch (Exception ex)
            {
                MessageBox.Show("Could not launch XBuddy Print Station: " + ex.Message, "XBuddy Print Station", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
    }
}
