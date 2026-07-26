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
      cwd: '/opt/smartvault/smartvault-api',
      env: {
        HOST: '0.0.0.0',
        HOSTNAME: '0.0.0.0',
      },
    },
    {
      name: 'sv-web',
      script: 'npm',
      args: 'start',
      cwd: '/opt/smartvault',
      env: {
        HOST: '0.0.0.0',
        HOSTNAME: '0.0.0.0',
      },
    },
  ],
};
