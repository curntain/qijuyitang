# 棋类对弈大厅（Qi Platform）

一个开箱即用的 Web 棋类对战平台：注册登录、大厅建房、实时联机对弈、人机对弈、战绩统计，支持手机和电脑浏览器访问。朋友之间只需一台电脑当服务器，局域网内所有人打开浏览器就能开玩。

## 支持的棋类

| 棋种 | 真人对战 | 人机对战 | 说明 |
| --- | :-: | :-: | --- |
| 五子棋 | ✅ | ✅ | 标准五连规则 |
| 围棋 | ✅ | ✅ | 9/13/19 路可选，含提子、禁自杀、打劫 |
| 中国象棋 | ✅ | ✅ | 完整走法与将军判定 |
| 国际象棋 | ✅ | ✅ | 完整规则（含王车易位、升变） |
| 四国军棋 | ✅ | — | 2~4 人，战前可自动/手动布阵，迷雾（敌方棋子显示 ?），工兵铁路飞行，夺旗淘汰，4 人时南北组队对抗东西 |

## 主要功能

- 🏠 大厅建房 / 加入，支持房间号或邀请链接直达
- 🤖 除军棋外均支持与 AI 对弈（服务端独立线程计算，不阻塞对战）
- 👥 四国军棋 2~4 人开局，布阵阶段可一键自动布阵或自由摆放
- 🔄 对局内支持悔棋（需对方同意，军棋除外）、认输、断线重连
- 📊 每人每棋种的胜负平战绩统计
- 📱 移动端自适应 + 落子音效

## 技术栈

- **前端**：React 18 + TypeScript + Vite，Canvas 棋盘渲染
- **后端**：Node.js + Express + Socket.IO（实时通信）+ better-sqlite3（本地数据库，零配置）
- **规则引擎**：前后端共享的 TypeScript 引擎（`shared/`），服务端权威校验，客户端无法作弊
- **工程结构**：npm workspaces 单仓多包（`shared` / `server` / `client`）

## 快速开始

> 环境要求：Node.js **20 或 22 LTS**（推荐 22）。注意不要用太新的非 LTS 大版本（如 24/26），`better-sqlite3` 需要匹配版本的预编译二进制。

```bash
# 1. 克隆项目
git clone <本仓库地址>
cd 棋类对弈大厅

# 2. 安装依赖（首次需要编译 better-sqlite3，见下方常见问题）
npm install

# 3. 构建前端
npm run build

# 4. 启动服务（默认端口 3001）
npm start
```

启动后浏览器打开 `http://localhost:3001` 即可，注册账号后进入大厅。

> 开发模式（前端热更新）：分别开两个终端执行 `npm run dev:server` 和 `npm run dev:client`，然后访问 `http://localhost:5173`。

## 📶 局域网多人对战（朋友一起玩）

服务默认监听所有网卡，无需任何额外配置，朋友连同一个 Wi-Fi 就能玩：

### 第 1 步：在你自己的电脑上启动服务

按上面「快速开始」启动后保持终端不关闭。

### 第 2 步：查看你的局域网 IP

| 系统 | 查看命令 | 说明 |
| --- | --- | --- |
| macOS | `ipconfig getifaddr en0` | Wi-Fi 通常是 en0，不行就试 en1 |
| Windows | `ipconfig` | 找「IPv4 地址」，一般是 `192.168.x.x` |
| Linux | `hostname -I` | 取第一个地址 |

### 第 3 步：把地址告诉朋友

朋友在**同一局域网**内的浏览器打开：

```
http://你的局域网IP:3001
```

例如 `http://192.168.1.100:3001`，注册账号即可进大厅互相建房对战。

### ⚠️ 如果朋友打不开页面

通常是防火墙拦截，按系统放行 3001 端口：

- **macOS**：首次启动时如弹窗「是否允许 node 接受传入网络连接」选**允许**；或在「系统设置 → 网络 → 防火墙」中关闭/放行。
- **Windows**：管理员运行 `netsh advfirewall firewall add rule name="qi-platform" dir=in action=allow protocol=TCP localport=3001`；或首次弹窗时选择「允许访问」（注意勾选「专用网络」）。
- **Linux**：`sudo ufw allow 3001/tcp` 或对应防火墙放行。

## ☁️ 公网部署（有公网 IP 的情况）

如果你有公网 IP（云服务器，或家里宽带是公网 IP），可以让不在同一个 Wi-Fi 的朋友也能玩。

### 云服务器（阿里云/腾讯云等）

云服务器默认有安全组/防火墙，需要放行端口：

1. 在云控制台的「安全组」/「防火墙」中添加规则：入方向允许 **TCP 3001**（来源 `0.0.0.0/0`）
2. 服务器内部防火墙也要放行：`sudo ufw allow 3001/tcp`
3. 按下方「生产环境部署」启动服务
4. 朋友访问 `http://你的公网IP:3001`

### 家庭宽带公网 IP（有路由器）

需要在路由器上做端口映射（端口转发/虚拟服务器）：

1. 登录路由器管理后台，找到「端口映射 / 虚拟服务器 / Port Forwarding」
2. 添加规则：外部端口 `3001` → 内部地址 `你电脑的局域网IP` 端口 `3001`，协议 TCP（如 3001 被运营商封，外部端口可改成 8080 等）
3. 放行电脑防火墙（见上方局域网一节的说明）
4. 朋友访问 `http://你的公网IP:3001`

> 家庭宽带的公网 IP 可能不固定，重启光猫会变；可考虑用 DDNS（动态域名）服务，或用内网穿透工具（frp、tailscale 等）代替。
> 注意：部分运营商会封锁家庭宽带的 80/443/8080 等常用端口，选端口时避开，必要时咨询运营商。

### 🔒 公网暴露的安全注意（重要）

公网部署后任何人都能访问，务必做到：

1. **必须改 `JWT_SECRET`**：`ecosystem.config.js` 里换成随机长字符串（`openssl rand -hex 32`），否则别人可以伪造登录凭证；
2. **密码安全**：平台已用 bcrypt 加盐哈希存储密码，提醒朋友别用过于简单的密码；
3. **建议加 HTTPS + 域名**（可选但推荐）：如果有域名，用 Caddy 反代可自动申请证书：

   ```
   # Caddyfile
   your.domain.com {
       reverse_proxy localhost:3001
   }
   ```

   Caddy 会自动申请并续期 Let's Encrypt 证书，之后用 `https://your.domain.com` 访问；
4. 平台没有内置管理后台，若被陌生人滥用，可直接删除 `server/data/game.db` 清空所有账号重来。

## 生产环境部署（可选）

若要长期挂在云服务器 / 家里的常开设备上，推荐用 pm2 守护：

```bash
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save && pm2 startup   # 开机自启
```

上线前务必修改 `ecosystem.config.js` 中的 `JWT_SECRET` 为随机长字符串：

```bash
openssl rand -hex 32   # 生成一个随机密钥填进去
```

直接 `npm start` 也可以，但进程退出后不会自动拉起。

## 项目结构

```
├── shared/            # 前后端共享：棋类规则引擎、类型、测试
│   ├── src/games/     #   gomoku / go / xiangqi / chess / junqi 引擎
│   └── tests/         #   41 个单元测试（vitest）
├── server/            # Node.js 服务端
│   ├── src/index.ts   #   Express + Socket.IO 入口，托管前端构建产物
│   ├── src/rooms.ts   #   房间/对局/布阵/回合/淘汰逻辑（服务端权威）
│   ├── src/auth.ts    #   注册登录（bcrypt 哈希 + JWT Cookie）
│   ├── src/db.ts      #   SQLite（用户与战绩，数据文件自动生成于 server/data/）
│   └── src/ai/        #   AI（独立 Worker 线程，限时计算）
├── client/            # React 前端
│   ├── src/boards/    #   五种棋的 Canvas 棋盘组件 + 军棋布阵编辑器
│   └── src/pages/     #   登录 / 大厅 / 对局页面
└── scripts/           # 端到端与 AI 冒烟测试脚本
```

## 测试

```bash
npm test                        # 41 个规则引擎单元测试
npx tsx scripts/ai-smoke.ts     # AI 出着冒烟测试（需先启动无关）
npx tsx scripts/e2e.ts          # 端到端测试（需先 npm start）
```

## 常见问题

**Q：`npm install` 时报 better-sqlite3 编译错误？**
A：先确认 Node 版本是 20/22 LTS（太新的版本没有预编译包，会触发本地编译）；若确需编译，该库需要本机编译环境：macOS 执行 `xcode-select --install`；Windows 安装 Visual Studio Build Tools（C++ 桌面开发组件）；Linux 安装 `gcc` / `make` / `python3`。

**Q：端口 3001 被占用？**
A：`PORT=3002 npm start` 即可换端口，访问地址同步改。

**Q：数据存在哪里？可以删号重来吗？**
A：账号与战绩存在 `server/data/game.db`（SQLite 单文件），删除该文件即重置所有数据。

**Q：军棋为什么没有 AI？**
A：四国军棋是暗棋 + 多人博弈，规则上暂只提供真人对战。

## License

MIT
