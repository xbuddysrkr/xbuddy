using System;
using System.Diagnostics;
using System.IO;
using System.ServiceProcess;
using System.Threading;

namespace XBuddyPrintStation
{
    public class XBuddyService : ServiceBase
    {
        public const string SERVICE_NAME = "XBuddy Print Agent";
        public const string DISPLAY_NAME = "XBuddy Print Station Agent";
        
        private Process _nodeProcess;
        private bool _isStopping = false;
        private Thread _workerThread;
        private readonly object _lock = new object();

        public XBuddyService()
        {
            this.ServiceName = SERVICE_NAME;
            this.CanStop = true;
            this.CanShutdown = true;
            this.AutoLog = true;
        }

        private static string GetLogPath()
        {
            string programData = Environment.GetEnvironmentVariable("PROGRAMDATA");
            if (string.IsNullOrEmpty(programData))
            {
                programData = @"C:\ProgramData";
            }
            string logDir = Path.Combine(programData, @"XBuddyPrintStation\logs");
            if (!Directory.Exists(logDir))
            {
                try { Directory.CreateDirectory(logDir); } catch { }
            }
            return Path.Combine(logDir, "service.log");
        }

        public static void Log(string message)
        {
            try
            {
                string line = string.Format("[{0:yyyy-MM-dd HH:mm:ss}] {1}{2}", DateTime.Now, message, Environment.NewLine);
                File.AppendAllText(GetLogPath(), line);
                Console.Write(line);
            }
            catch { }
        }

        protected override void OnStart(string[] args)
        {
            Log("Service starting...");
            _isStopping = false;
            _workerThread = new Thread(WorkerLoop)
            {
                IsBackground = true,
                Name = "XBuddyWorker"
            };
            _workerThread.Start();
            Log("Service started successfully.");
        }

        protected override void OnStop()
        {
            Log("Service stopping...");
            _isStopping = true;
            StopChildProcess();
            Log("Service stopped.");
        }

        protected override void OnShutdown()
        {
            Log("System shutdown detected.");
            OnStop();
        }

        private void WorkerLoop()
        {
            while (!_isStopping)
            {
                try
                {
                    StartChildProcess();

                    if (_nodeProcess != null && !_nodeProcess.HasExited)
                    {
                        _nodeProcess.WaitForExit();
                    }

                    if (!_isStopping)
                    {
                        Log("Child node process exited unexpectedly. Restarting in 3 seconds...");
                        Thread.Sleep(3000);
                    }
                }
                catch (Exception ex)
                {
                    Log("Exception in worker loop: " + ex.Message);
                    if (!_isStopping)
                    {
                        Thread.Sleep(5000);
                    }
                }
            }
        }

        private void StartChildProcess()
        {
            lock (_lock)
            {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                string nodeExe = Path.Combine(baseDir, @"runtime\node.exe");
                
                // Fallback to system node if runtime\node.exe not present
                if (!File.Exists(nodeExe))
                {
                    nodeExe = "node.exe";
                }

                string scriptPath = Path.Combine(baseDir, @"app\index.js");
                if (!File.Exists(scriptPath))
                {
                    // Fallback to current dir index.js
                    scriptPath = Path.Combine(baseDir, "index.js");
                }

                string workingDir = Path.GetDirectoryName(scriptPath);

                Log(string.Format("Spawning: {0} {1} (CWD: {2})", nodeExe, scriptPath, workingDir));

                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = nodeExe,
                    Arguments = string.Format("\"{0}\"", scriptPath),
                    WorkingDirectory = workingDir,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    WindowStyle = ProcessWindowStyle.Hidden
                };

                // Forward environment variables and ensure bin/runtime access
                psi.EnvironmentVariables["PRINT_AGENT_PORT"] = "3001";
                psi.EnvironmentVariables["XBUDDY_INSTALL_DIR"] = baseDir;

                string programData = Environment.GetEnvironmentVariable("PROGRAMDATA");
                if (string.IsNullOrEmpty(programData)) programData = @"C:\ProgramData";
                psi.EnvironmentVariables["PROGRAMDATA"] = programData;

                string currentPath = Environment.GetEnvironmentVariable("PATH") ?? "";
                string binDir = Path.Combine(baseDir, "bin");
                string runtimeDir = Path.Combine(baseDir, "runtime");
                psi.EnvironmentVariables["PATH"] = binDir + ";" + runtimeDir + ";" + currentPath;

                string mutoolExe = Path.Combine(binDir, "mutool.exe");
                if (File.Exists(mutoolExe))
                {
                    psi.EnvironmentVariables["MUTOOL_PATH"] = mutoolExe;
                }

                // Forward provisioned AGENT_SECRET_KEY from station config.json
                string configPath = Path.Combine(programData, @"XBuddyPrintStation\config.json");
                if (File.Exists(configPath))
                {
                    try
                    {
                        string configText = File.ReadAllText(configPath);
                        var matchKey = System.Text.RegularExpressions.Regex.Match(configText, "\"agentSecretKey\"\\s*:\\s*\"([^\"]+)\"");
                        if (matchKey.Success && matchKey.Groups[1].Value.Length >= 32)
                        {
                            psi.EnvironmentVariables["AGENT_SECRET_KEY"] = matchKey.Groups[1].Value;
                        }
                    }
                    catch { }
                }

                _nodeProcess = new Process { StartInfo = psi, EnableRaisingEvents = true };

                _nodeProcess.OutputDataReceived += (s, e) =>
                {
                    if (!string.IsNullOrEmpty(e.Data)) Log("[OUT] " + e.Data);
                };
                _nodeProcess.ErrorDataReceived += (s, e) =>
                {
                    if (!string.IsNullOrEmpty(e.Data)) Log("[ERR] " + e.Data);
                };

                _nodeProcess.Start();
                _nodeProcess.BeginOutputReadLine();
                _nodeProcess.BeginErrorReadLine();

                Log(string.Format("Child node process started with PID {0}", _nodeProcess.Id));
            }
        }

        private void StopChildProcess()
        {
            lock (_lock)
            {
                try
                {
                    if (_nodeProcess != null && !_nodeProcess.HasExited)
                    {
                        Log(string.Format("Terminating child process PID {0}...", _nodeProcess.Id));
                        // Kill process tree
                        KillProcessTree(_nodeProcess.Id);
                        if (!_nodeProcess.WaitForExit(4000))
                        {
                            _nodeProcess.Kill();
                        }
                    }
                }
                catch (Exception ex)
                {
                    Log("Error stopping child process: " + ex.Message);
                }
            }
        }

        private static void KillProcessTree(int pid)
        {
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo("taskkill", string.Format("/F /T /PID {0}", pid))
                {
                    CreateNoWindow = true,
                    UseShellExecute = false
                };
                using (Process p = Process.Start(psi))
                {
                    p.WaitForExit(3000);
                }
            }
            catch { }
        }

        public void RunConsole()
        {
            Console.WriteLine("Running XBuddy Print Agent in interactive console mode. Press Ctrl+C to exit.");
            OnStart(new string[0]);
            Console.CancelKeyPress += (s, e) =>
            {
                e.Cancel = true;
                OnStop();
                Environment.Exit(0);
            };
            while (true)
            {
                Thread.Sleep(1000);
            }
        }

        public static int Main(string[] args)
        {
            if (args.Length > 0)
            {
                string arg = args[0].ToLowerInvariant();
                if (arg == "--console" || arg == "-c" || arg == "/c")
                {
                    XBuddyService svc = new XBuddyService();
                    svc.RunConsole();
                    return 0;
                }
            }

            if (Environment.UserInteractive)
            {
                Console.WriteLine("XBuddy Print Agent - Windows Service Executable");
                Console.WriteLine("Usage:");
                Console.WriteLine("  XBuddyService.exe --console     (Run interactively)");
                Console.WriteLine("Or install as service using sc.exe create \"" + SERVICE_NAME + "\" binPath= \"...\"");
                
                // If double clicked directly, run in console mode so operator sees feedback
                XBuddyService svc = new XBuddyService();
                svc.RunConsole();
                return 0;
            }

            ServiceBase.Run(new XBuddyService());
            return 0;
        }
    }
}
