# OpenClaw IM Quickly Setup

A lightweight web-based wizard for configuring IM integrations (Telegram, WeChat, Feishu/Lark) on an [OpenClaw](https://github.com/openclaw/openclaw) instance.

Zero dependencies — only Node.js built-in modules required.

![screenshot](https://raw.githubusercontent.com/jueduizone/openclaw-im-quickly-setup/main/docs/screenshot.png)

---

## Supported IMs

| Platform | Mode | Capabilities |
|----------|------|--------------|
| Telegram | Bot Token | Send & receive messages |
| WeChat (企业微信) | Group Webhook | Send only |
| WeChat (个人) | openclaw-weixin plugin | Full personal WeChat |
| Feishu / Lark | Self-built App Bot | Private chat + group @ |

---

## Requirements

- Node.js ≥ 16 (already available if OpenClaw is installed)
- A running [OpenClaw](https://github.com/openclaw/openclaw) installation at `~/.openclaw/`
- Desktop environment with a browser (for the GUI)

---

## Quick Start (Local)

```bash
git clone https://github.com/callmeianx/openclaw-im-quickly-setup.git
cd openclaw-im-quickly-setup
node server.js
```

The wizard opens automatically at `http://127.0.0.1:3131`.

---

## Deploy to a Machine (System-wide)

Recommended path for distributing to multiple machines or bundling into a system image.

### 1. Copy files to `/opt/openclaw-setup/`

```bash
sudo cp -r openclaw-im-quickly-setup /opt/openclaw-setup
```

No `npm install` needed — zero external dependencies.

### 2. Create a desktop shortcut

Copy the included `.desktop` file to the user's desktop:

```bash
cp /opt/openclaw-setup/openclaw-setup.desktop ~/Desktop/
chmod +x ~/Desktop/openclaw-setup.desktop
```

Or, to add it for **all future users** on the machine:

```bash
sudo cp /opt/openclaw-setup/openclaw-setup.desktop /etc/skel/Desktop/
```

The `.desktop` file starts the server and opens the browser automatically:

```ini
[Desktop Entry]
Name=OpenClaw 配置向导
Comment=Configure IM integrations for OpenClaw
Exec=bash -c 'cd /opt/openclaw-setup && node server.js & sleep 1 && xdg-open http://127.0.0.1:3131'
Icon=/opt/openclaw-setup/public/icon.png
Terminal=false
Type=Application
```

### 3. Bundle into a system image

If you're building a custom Debian/Ubuntu image:

1. Copy `/opt/openclaw-setup/` into the image filesystem
2. Copy `openclaw-setup.desktop` to `/etc/skel/Desktop/`
3. Ensure Node.js is installed in the image (`apt install nodejs`)

Every user who logs in will have the setup wizard ready on their desktop.

---

## How It Works

```
User double-clicks desktop icon
        ↓
server.js starts on port 3131 (localhost only)
        ↓
Browser opens the wizard UI
        ↓
User fills in credentials (Telegram token / Feishu App ID+Secret / WeChat webhook)
        ↓
Wizard writes config to ~/.openclaw/openclaw.json and restarts Gateway
```

The server binds to `127.0.0.1` only and never exposes credentials externally.

---

## Feishu / Lark Setup Notes

Feishu requires several manual steps in the [Open Platform](https://open.feishu.cn/app) before the bot works:

1. Create a self-built app → enable **Bot** capability
2. In **Permission Management**, grant:
   - `im:message` (send messages)
   - `im:message.p2p_msg:readonly` (receive private messages)
3. In **Event & Callback → Event Configuration**, add event `im.message.receive_v1`
   - ⚠️ After adding the event, **manually click "Enable"** on each required permission in the right panel — they are NOT auto-enabled
4. For group chat: in the Feishu group → **Group Settings → Bots → Add Bot** → select your app
   - Also grant `im:message:group_at_msg:readonly` in Permission Management
5. Publish a new version — changes only take effect after publishing

---

## Project Structure

```
openclaw-im-quickly-setup/
├── server.js              # HTTP server (Node.js built-ins only)
├── public/
│   └── index.html         # Single-page wizard UI
├── openclaw-setup.desktop # Linux desktop shortcut
├── package.json
└── README.md
```

---

## License

MIT
