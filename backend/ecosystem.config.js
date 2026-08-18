module.exports = {
  apps: [
    {
      name: 'srm-api-server',
      script: 'server.js',
      // Single instance strictly required. Socket.IO polling requires sticky sessions.
      // With PM2 cluster round-robin, clients running cached code hit different workers and get "Session ID Unknown".
      instances: 1, 
      exec_mode: 'cluster', 
      // Restart if memory exceeds 2.5GB per instance
      max_memory_restart: '2500M',
      env: {
        NODE_ENV: 'production',
      }
    },
    {
      name: 'srm-canvas-worker',
      script: 'worker.js',
      // Using 1 instance for the heavy canvas generation worker
      instances: 1,
      exec_mode: 'cluster',
      // Restart if memory exceeds 2GB
      max_memory_restart: '2G',
      env: {
        NODE_ENV: 'production',
      }
    }
  ]
};
