// pm2 守护进程配置(生产部署用)
// 用法:服务器上先 npm install && npm run build,然后 pm2 start ecosystem.config.js && pm2 save
// 约束:2C2G 与其他业务共用,限制堆 256MB,只跑单实例

module.exports = {
  apps: [
    {
      name: 'qi-platform',
      cwd: __dirname,
      script: 'server/src/index.ts',
      interpreter: 'node',
      // 与 npm start 保持一致:限制堆内存,tsx 加载 TS
      node_args: ['--max-old-space-size=256', '--import', 'tsx'],
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '400M',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        // 部署时请改为随机长字符串,例如:openssl rand -hex 32
        JWT_SECRET: 'change-me-in-production',
      },
    },
  ],
};
