module.exports = {
  apps: [
    {
      name: 'sv-minio',
      script: '/usr/local/bin/minio',
      args: 'server /opt/smartvault-data/minio --console-address :9001',
      env: {
        MINIO_ROOT_USER: 'minioadmin',
        MINIO_ROOT_PASSWORD: 'sanyasi@1981',
      },
    },
    {
      name: 'sv-api',
      script: 'server.js',
      cwd: '/mnt/c/Users/saksham/Desktop/codes/webapps/smartvault/smartvault-api',
    },
    {
      name: 'sv-web',
      script: 'npm',
      args: 'run dev',
      cwd: '/mnt/c/Users/saksham/Desktop/codes/webapps/smartvault',
    },
  ],
};
