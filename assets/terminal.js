/* ═══════════════════════════════════════════════════════════════
   AI Unlocked — Linux Terminal Simulator
   Runs entirely client-side. Uses xterm.js for the terminal UI
   and a JavaScript virtual filesystem + command interpreter.
   ═══════════════════════════════════════════════════════════════ */
(() => {
    "use strict";

    // ── xterm.js setup ──────────────────────────────────────────
    const THEMES = {
        dark: {
            background:  "#0d1117",
            foreground:  "#c9d1d9",
            cursor:      "#58a6ff",
            cursorAccent:"#0d1117",
            selectionBackground: "rgba(56,139,253,0.3)",
            black:   "#484f58", red:     "#ff7b72", green:   "#3fb950",
            yellow:  "#d29922", blue:    "#58a6ff", magenta: "#bc8cff",
            cyan:    "#39d353", white:   "#c9d1d9",
            brightBlack:"#6e7681", brightRed:"#ffa198", brightGreen:"#56d364",
            brightYellow:"#e3b341", brightBlue:"#79c0ff", brightMagenta:"#d2a8ff",
            brightCyan:"#56d364", brightWhite:"#f0f6fc",
        },
        light: {
            background:  "#f6f8fa",
            foreground:  "#24292f",
            cursor:      "#6366f1",
            cursorAccent:"#f6f8fa",
            selectionBackground: "rgba(99,102,241,0.15)",
            black:   "#24292f", red:     "#cf222e", green:   "#116329",
            yellow:  "#4d2d00", blue:    "#0550ae", magenta: "#8250df",
            cyan:    "#1b7c83", white:   "#6e7781",
            brightBlack:"#57606a", brightRed:"#a40e26", brightGreen:"#1a7f37",
            brightYellow:"#633c01", brightBlue:"#0969da", brightMagenta:"#8250df",
            brightCyan:"#1b7c83", brightWhite:"#8c959f",
        },
    };

    const currentTheme = document.documentElement.getAttribute("data-theme") || "dark";
    const term = new window.Terminal({
        theme: THEMES[currentTheme],
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
        fontSize: 14,
        lineHeight: 1.35,
        cursorBlink: true,
        cursorStyle: "bar",
        scrollback: 5000,
        allowProposedApi: true,
    });

    const fitAddon = new window.FitAddon.FitAddon();
    term.loadAddon(fitAddon);
    term.open(document.getElementById("terminal"));
    fitAddon.fit();

    window.addEventListener("resize", () => fitAddon.fit());

    // Theme switcher
    window.updateTermTheme = (theme) => {
        term.options.theme = THEMES[theme] || THEMES.dark;
        const wrapper = document.getElementById("terminalWrapper");
        wrapper.style.background = (THEMES[theme] || THEMES.dark).background;
    };
    document.getElementById("terminalWrapper").style.background = THEMES[currentTheme].background;

    // ── Virtual Filesystem ──────────────────────────────────────
    // Each node: { type: "dir"|"file", children: {}, content: "", permissions: "...", mtime: Date }
    function mkDir(permissions) {
        return { type: "dir", children: {}, permissions: permissions || "drwxr-xr-x", mtime: new Date() };
    }
    function mkFile(content, permissions) {
        return { type: "file", content: content || "", permissions: permissions || "-rw-r--r--", mtime: new Date() };
    }

    const fs = mkDir();
    fs.children = {
        home: (() => {
            const h = mkDir();
            h.children.user = (() => {
                const u = mkDir("drwxr-xr-x");
                u.children = {
                    "welcome.txt": mkFile(
                        "Welcome to the AI Unlocked Linux Terminal Simulator!\n\n" +
                        "This is a browser-based sandbox where you can practice Linux commands.\n" +
                        "Type 'help' to see all available commands.\n\n" +
                        "Features:\n" +
                        "  - 30+ real Linux commands\n" +
                        "  - Virtual filesystem with directories & files\n" +
                        "  - Tab completion\n" +
                        "  - Command history (↑/↓ arrows)\n" +
                        "  - Piping (cmd1 | cmd2)\n" +
                        "  - Output redirection (>, >>)\n" +
                        "  - Environment variables\n\n" +
                        "Happy learning! 🚀\n"
                    ),
                    "notes.txt": mkFile("Linux Basics:\n- Everything is a file\n- Commands are case-sensitive\n- Use man <command> for help\n- Use Tab for auto-completion\n"),
                    "Documents": (() => {
                        const d = mkDir();
                        d.children = {
                            "readme.md": mkFile("# My Project\n\nThis is a sample project directory.\n"),
                            "todo.txt": mkFile("1. Learn basic Linux commands\n2. Practice file management\n3. Understand piping and redirection\n4. Master grep and find\n5. Explore environment variables\n"),
                        };
                        return d;
                    })(),
                    "scripts": (() => {
                        const d = mkDir();
                        d.children = {
                            "hello.sh": mkFile("#!/bin/bash\necho \"Hello, World!\"\necho \"Today is $(date)\"\n", "-rwxr-xr-x"),
                            "greet.sh": mkFile("#!/bin/bash\nNAME=${1:-\"User\"}\necho \"Welcome, $NAME!\"\n", "-rwxr-xr-x"),
                        };
                        return d;
                    })(),
                    "data": (() => {
                        const d = mkDir();
                        d.children = {
                            "fruits.txt": mkFile("apple\nbanana\ncherry\ndate\nelderberry\nfig\ngrape\nhoneydew\n"),
                            "numbers.txt": mkFile("42\n17\n99\n3\n56\n78\n12\n34\n88\n5\n"),
                            "names.csv": mkFile("name,age,city\nAlice,30,New York\nBob,25,San Francisco\nCharlie,35,London\nDiana,28,Tokyo\nEve,32,Berlin\n"),
                            "log.txt": mkFile("[INFO] Server started on port 8080\n[DEBUG] Loading config from /etc/app.conf\n[INFO] Connected to database\n[WARN] Slow query detected (2.3s)\n[ERROR] Failed to send email notification\n[INFO] Request processed in 45ms\n[DEBUG] Cache hit for key: user_123\n[ERROR] Connection timeout to external API\n[INFO] Backup completed successfully\n[WARN] Disk usage above 80%\n"),
                        };
                        return d;
                    })(),
                    ".bashrc": mkFile("# ~/.bashrc\nexport PS1='\\u@\\h:\\w\\$ '\nalias ll='ls -la'\nalias la='ls -A'\nalias l='ls -CF'\n"),
                    ".hidden_secret": mkFile("You found the hidden file! 🎉\n"),
                };
                return u;
            })();
            return h;
        })(),
        etc: (() => {
            const e = mkDir();
            e.children = {
                "hostname": mkFile("aiunlocked\n"),
                "os-release": mkFile('NAME="AI Unlocked Linux"\nVERSION="1.0"\nID=aiunlocked\nPRETTY_NAME="AI Unlocked Linux Simulator"\n'),
                "passwd": mkFile("root:x:0:0:root:/root:/bin/bash\nuser:x:1000:1000:User:/home/user:/bin/bash\n"),
            };
            return e;
        })(),
        tmp: mkDir("drwxrwxrwt"),
        var: (() => {
            const v = mkDir();
            v.children.log = (() => {
                const l = mkDir();
                l.children["syslog"] = mkFile("[2026-04-07 10:00] System boot\n[2026-04-07 10:01] Network interface eth0 up\n[2026-04-07 10:02] SSH daemon started\n");
                return l;
            })();
            return v;
        })(),
        usr: (() => {
            const u = mkDir();
            u.children.bin = mkDir();
            u.children.local = mkDir();
            return u;
        })(),
    };

    // ── Shell State ─────────────────────────────────────────────
    let cwd = "/home/user";
    const env = {
        HOME: "/home/user",
        USER: "user",
        HOSTNAME: "aiunlocked",
        SHELL: "/bin/bash",
        PATH: "/usr/local/bin:/usr/bin:/bin",
        TERM: "xterm-256color",
        LANG: "en_US.UTF-8",
        PWD: "/home/user",
        EDITOR: "nano",
        PS1: "\\u@\\h:\\w\\$ ",
    };
    const aliases = { ll: "ls -la", la: "ls -A", l: "ls -CF" };
    const history = [];
    let historyIndex = -1;
    let currentLine = "";
    let cursorPos = 0;
    const startTime = Date.now();

    // ── Filesystem helpers ──────────────────────────────────────
    function resolvePath(p) {
        let path = p.trim();
        if (path.startsWith("~")) path = env.HOME + path.slice(1);
        if (!path.startsWith("/")) path = cwd + "/" + path;
        const parts = path.split("/").filter(Boolean);
        const resolved = [];
        for (const part of parts) {
            if (part === ".") continue;
            if (part === "..") { resolved.pop(); continue; }
            resolved.push(part);
        }
        return "/" + resolved.join("/");
    }

    function getNode(path) {
        const resolved = resolvePath(path);
        if (resolved === "/") return fs;
        const parts = resolved.split("/").filter(Boolean);
        let node = fs;
        for (const part of parts) {
            if (!node || node.type !== "dir" || !node.children[part]) return null;
            node = node.children[part];
        }
        return node;
    }

    function getParentAndName(path) {
        const resolved = resolvePath(path);
        const parts = resolved.split("/").filter(Boolean);
        const name = parts.pop();
        const parentPath = "/" + parts.join("/");
        return { parent: getNode(parentPath) || fs, name, parentPath };
    }

    function nodeSize(node) {
        if (node.type === "file") return node.content.length;
        let size = 4096;
        for (const c of Object.values(node.children || {})) size += nodeSize(c);
        return size;
    }

    function formatPermissions(node) {
        return node.permissions || (node.type === "dir" ? "drwxr-xr-x" : "-rw-r--r--");
    }

    function formatDate(d) {
        const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
        return `${months[d.getMonth()]} ${String(d.getDate()).padStart(2," ")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
    }

    // ── Output helpers (xterm.js uses \r\n) ─────────────────────
    function writeLn(text) { term.writeln(text); }
    function writeColour(text, colour) {
        const codes = {
            red: "31", green: "32", yellow: "33", blue: "34",
            magenta: "35", cyan: "36", white: "37", bold: "1",
            brightGreen: "92", brightBlue: "94", brightCyan: "96",
            brightYellow: "93", brightRed: "91", brightMagenta: "95",
        };
        return `\x1b[${codes[colour] || "37"}m${text}\x1b[0m`;
    }

    // ── Commands ────────────────────────────────────────────────
    const commands = {};

    commands.help = () => {
        const sections = [
            [writeColour("═══ AI Unlocked Linux Terminal ═══", "brightCyan"), ""],
            ["", ""],
            [writeColour("File Operations:", "brightYellow"), ""],
            ["  ls, cd, pwd, mkdir, rmdir, rm, touch, cp, mv, find, ln", ""],
            ["", ""],
            [writeColour("Text Processing:", "brightYellow"), ""],
            ["  cat, head, tail, echo, grep, wc, sort, uniq, tr, cut, tee", ""],
            ["", ""],
            [writeColour("System Info:", "brightYellow"), ""],
            ["  whoami, hostname, date, uname, uptime, env, export, printenv", ""],
            ["", ""],
            [writeColour("Utilities:", "brightYellow"), ""],
            ["  clear, history, alias, unalias, type, which, man, chmod", ""],
            ["  du, df, basename, dirname, seq, yes, true, false, exit", ""],
            ["", ""],
            [writeColour("Tips:", "brightGreen"), ""],
            ["  • Use " + writeColour("Tab", "cyan") + " for auto-completion", ""],
            ["  • Use " + writeColour("↑/↓", "cyan") + " arrows for command history", ""],
            ["  • Supports " + writeColour("piping", "cyan") + " (cmd1 | cmd2) and " + writeColour("redirection", "cyan") + " (>, >>)", ""],
            ["  • Type " + writeColour("man <command>", "cyan") + " for command help", ""],
        ];
        sections.forEach(([line]) => writeLn(line));
    };

    commands.ls = (args, _stdin) => {
        let showAll = false, showLong = false, target = ".";
        const files = [];
        for (const a of args) {
            if (a.startsWith("-")) {
                if (a.includes("a") || a.includes("A")) showAll = true;
                if (a.includes("l")) showLong = true;
            } else {
                target = a;
            }
        }
        const node = getNode(target);
        if (!node) return writeLn(`ls: cannot access '${target}': No such file or directory`);
        if (node.type === "file") {
            files.push(target.split("/").pop());
        } else {
            for (const name of Object.keys(node.children).sort()) {
                if (!showAll && name.startsWith(".")) continue;
                files.push(name);
            }
        }

        if (showLong) {
            if (node.type === "dir") writeLn(`total ${Object.keys(node.children).length}`);
            for (const name of files) {
                const child = node.type === "dir" ? node.children[name] : node;
                const perms = formatPermissions(child);
                const size = String(child.type === "file" ? child.content.length : 4096).padStart(6);
                const date = formatDate(child.mtime);
                const display = child.type === "dir"
                    ? writeColour(name, "brightBlue")
                    : (child.permissions && child.permissions.includes("x") ? writeColour(name, "brightGreen") : name);
                writeLn(`${perms} 1 user user ${size} ${date} ${display}`);
            }
            return;
        }

        // Columnar output
        const coloured = files.map(name => {
            const child = node.type === "dir" ? node.children[name] : node;
            if (child.type === "dir") return writeColour(name, "brightBlue");
            if (child.permissions && child.permissions.includes("x")) return writeColour(name, "brightGreen");
            return name;
        });
        if (coloured.length) writeLn(coloured.join("  "));
    };

    commands.cd = (args) => {
        const target = args[0] || env.HOME;
        const resolved = resolvePath(target);
        const node = getNode(resolved);
        if (!node) return writeLn(`cd: ${target}: No such file or directory`);
        if (node.type !== "dir") return writeLn(`cd: ${target}: Not a directory`);
        cwd = resolved;
        env.PWD = cwd;
    };

    commands.pwd = () => writeLn(cwd);

    commands.mkdir = (args) => {
        let parents = false;
        const dirs = [];
        for (const a of args) {
            if (a === "-p") parents = true;
            else dirs.push(a);
        }
        if (!dirs.length) return writeLn("mkdir: missing operand");
        for (const d of dirs) {
            if (parents) {
                const resolved = resolvePath(d);
                const parts = resolved.split("/").filter(Boolean);
                let current = fs;
                for (const part of parts) {
                    if (!current.children[part]) {
                        current.children[part] = mkDir();
                    }
                    current = current.children[part];
                }
            } else {
                const { parent, name } = getParentAndName(d);
                if (!parent) return writeLn(`mkdir: cannot create directory '${d}': No such file or directory`);
                if (parent.children[name]) return writeLn(`mkdir: cannot create directory '${d}': File exists`);
                parent.children[name] = mkDir();
            }
        }
    };

    commands.rmdir = (args) => {
        if (!args.length) return writeLn("rmdir: missing operand");
        for (const d of args) {
            const { parent, name } = getParentAndName(d);
            const node = parent && parent.children[name];
            if (!node) return writeLn(`rmdir: '${d}': No such file or directory`);
            if (node.type !== "dir") return writeLn(`rmdir: '${d}': Not a directory`);
            if (Object.keys(node.children).length > 0) return writeLn(`rmdir: '${d}': Directory not empty`);
            delete parent.children[name];
        }
    };

    commands.rm = (args) => {
        let recursive = false, force = false;
        const targets = [];
        for (const a of args) {
            if (a.startsWith("-")) {
                if (a.includes("r") || a.includes("R")) recursive = true;
                if (a.includes("f")) force = true;
            } else targets.push(a);
        }
        if (!targets.length) return writeLn("rm: missing operand");
        for (const t of targets) {
            const { parent, name } = getParentAndName(t);
            const node = parent && parent.children[name];
            if (!node) {
                if (!force) writeLn(`rm: cannot remove '${t}': No such file or directory`);
                continue;
            }
            if (node.type === "dir" && !recursive) {
                writeLn(`rm: cannot remove '${t}': Is a directory`);
                continue;
            }
            delete parent.children[name];
        }
    };

    commands.touch = (args) => {
        if (!args.length) return writeLn("touch: missing file operand");
        for (const f of args) {
            const { parent, name } = getParentAndName(f);
            if (!parent) return writeLn(`touch: cannot touch '${f}': No such file or directory`);
            if (parent.children[name]) {
                parent.children[name].mtime = new Date();
            } else {
                parent.children[name] = mkFile("");
            }
        }
    };

    commands.cp = (args) => {
        let recursive = false;
        const paths = [];
        for (const a of args) {
            if (a.startsWith("-") && (a.includes("r") || a.includes("R"))) recursive = true;
            else paths.push(a);
        }
        if (paths.length < 2) return writeLn("cp: missing destination operand");
        const src = getNode(paths[0]);
        if (!src) return writeLn(`cp: cannot stat '${paths[0]}': No such file or directory`);
        if (src.type === "dir" && !recursive) return writeLn(`cp: omitting directory '${paths[0]}'`);
        const { parent: destParent, name: destName } = getParentAndName(paths[1]);
        if (!destParent) return writeLn(`cp: cannot create '${paths[1]}': No such file or directory`);

        function deepCopy(node) {
            if (node.type === "file") return mkFile(node.content, node.permissions);
            const d = mkDir(node.permissions);
            for (const [k, v] of Object.entries(node.children)) d.children[k] = deepCopy(v);
            return d;
        }
        destParent.children[destName] = deepCopy(src);
    };

    commands.mv = (args) => {
        if (args.length < 2) return writeLn("mv: missing destination operand");
        const { parent: srcParent, name: srcName } = getParentAndName(args[0]);
        const srcNode = srcParent && srcParent.children[srcName];
        if (!srcNode) return writeLn(`mv: cannot stat '${args[0]}': No such file or directory`);
        const { parent: destParent, name: destName } = getParentAndName(args[1]);
        if (!destParent) return writeLn(`mv: cannot move to '${args[1]}': No such file or directory`);
        destParent.children[destName] = srcNode;
        delete srcParent.children[srcName];
    };

    commands.cat = (args, stdin) => {
        if (!args.length && stdin != null) { writeLn(stdin); return stdin; }
        if (!args.length) return writeLn("cat: missing file operand");
        let output = "";
        for (const f of args) {
            const node = getNode(f);
            if (!node) { writeLn(`cat: ${f}: No such file or directory`); continue; }
            if (node.type === "dir") { writeLn(`cat: ${f}: Is a directory`); continue; }
            output += node.content;
        }
        if (output) writeLn(output.replace(/\n$/, ""));
        return output;
    };

    commands.head = (args, stdin) => {
        let n = 10;
        const files = [];
        for (let i = 0; i < args.length; i++) {
            if (args[i] === "-n" && args[i + 1]) { n = parseInt(args[++i], 10); }
            else if (args[i].startsWith("-") && !isNaN(args[i].slice(1))) { n = parseInt(args[i].slice(1), 10); }
            else files.push(args[i]);
        }
        let content = stdin || "";
        if (files.length) {
            const node = getNode(files[0]);
            if (!node) return writeLn(`head: cannot open '${files[0]}': No such file or directory`);
            content = node.content;
        }
        const lines = content.split("\n").slice(0, n);
        const out = lines.join("\n");
        writeLn(out.replace(/\n$/, ""));
        return out;
    };

    commands.tail = (args, stdin) => {
        let n = 10;
        const files = [];
        for (let i = 0; i < args.length; i++) {
            if (args[i] === "-n" && args[i + 1]) { n = parseInt(args[++i], 10); }
            else if (args[i].startsWith("-") && !isNaN(args[i].slice(1))) { n = parseInt(args[i].slice(1), 10); }
            else files.push(args[i]);
        }
        let content = stdin || "";
        if (files.length) {
            const node = getNode(files[0]);
            if (!node) return writeLn(`tail: cannot open '${files[0]}': No such file or directory`);
            content = node.content;
        }
        const lines = content.split("\n").filter(l => l.length > 0).slice(-n);
        const out = lines.join("\n");
        writeLn(out);
        return out + "\n";
    };

    commands.echo = (args) => {
        let text = args.join(" ");
        // Expand env variables
        text = text.replace(/\$(\w+)/g, (_, v) => env[v] || "");
        text = text.replace(/^["']|["']$/g, "");
        writeLn(text);
        return text + "\n";
    };

    commands.grep = (args, stdin) => {
        let ignoreCase = false, showLineNum = false, count = false, invert = false;
        let pattern = null;
        const files = [];
        for (const a of args) {
            if (a.startsWith("-") && !pattern) {
                if (a.includes("i")) ignoreCase = true;
                if (a.includes("n")) showLineNum = true;
                if (a.includes("c")) count = true;
                if (a.includes("v")) invert = true;
            } else if (!pattern) {
                pattern = a;
            } else {
                files.push(a);
            }
        }
        if (!pattern) return writeLn("grep: missing pattern");
        const flags = ignoreCase ? "i" : "";
        let re;
        try { re = new RegExp(pattern, flags); } catch { re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags); }

        let content = stdin || "";
        if (files.length) {
            const node = getNode(files[0]);
            if (!node) return writeLn(`grep: ${files[0]}: No such file or directory`);
            content = node.content;
        }

        const lines = content.split("\n");
        const matched = [];
        lines.forEach((line, i) => {
            const match = re.test(line);
            if (match !== invert) {
                if (showLineNum) matched.push(`${i + 1}:${line}`);
                else matched.push(line);
            }
        });

        if (count) {
            writeLn(String(matched.length));
            return matched.length + "\n";
        }
        const out = matched.filter(l => l).join("\n");
        if (out) writeLn(out);
        return out + "\n";
    };

    commands.wc = (args, stdin) => {
        const files = args.filter(a => !a.startsWith("-"));
        let content = stdin || "";
        if (files.length) {
            const node = getNode(files[0]);
            if (!node) return writeLn(`wc: ${files[0]}: No such file or directory`);
            content = node.content;
        }
        const lines = content.split("\n").length - (content.endsWith("\n") ? 1 : 0);
        const words = content.trim().split(/\s+/).filter(Boolean).length;
        const chars = content.length;
        const out = `  ${lines}  ${words} ${chars}` + (files.length ? ` ${files[0]}` : "");
        writeLn(out);
        return out + "\n";
    };

    commands.sort = (args, stdin) => {
        let reverse = false, numeric = false, unique = false;
        const files = [];
        for (const a of args) {
            if (a.startsWith("-")) {
                if (a.includes("r")) reverse = true;
                if (a.includes("n")) numeric = true;
                if (a.includes("u")) unique = true;
            } else files.push(a);
        }
        let content = stdin || "";
        if (files.length) {
            const node = getNode(files[0]);
            if (!node) return writeLn(`sort: cannot read '${files[0]}': No such file or directory`);
            content = node.content;
        }
        let lines = content.split("\n").filter(Boolean);
        if (numeric) lines.sort((a, b) => parseFloat(a) - parseFloat(b));
        else lines.sort();
        if (reverse) lines.reverse();
        if (unique) lines = [...new Set(lines)];
        const out = lines.join("\n");
        writeLn(out);
        return out + "\n";
    };

    commands.uniq = (args, stdin) => {
        let content = stdin || "";
        const files = args.filter(a => !a.startsWith("-"));
        const countFlag = args.includes("-c");
        if (files.length) {
            const node = getNode(files[0]);
            if (!node) return writeLn(`uniq: cannot open '${files[0]}': No such file or directory`);
            content = node.content;
        }
        const lines = content.split("\n");
        const result = [];
        let prev = null, count = 0;
        for (const line of lines) {
            if (line === prev) { count++; }
            else {
                if (prev !== null) result.push(countFlag ? `${String(count).padStart(7)} ${prev}` : prev);
                prev = line;
                count = 1;
            }
        }
        if (prev !== null && prev !== "") result.push(countFlag ? `${String(count).padStart(7)} ${prev}` : prev);
        const out = result.filter(Boolean).join("\n");
        writeLn(out);
        return out + "\n";
    };

    commands.tr = (args, stdin) => {
        if (args.length < 2) return writeLn("tr: missing operand");
        let content = stdin || "";
        const from = args[0].replace(/^['"]|['"]$/g, "");
        const to = args[1].replace(/^['"]|['"]$/g, "");
        let out = "";
        for (const ch of content) {
            const idx = from.indexOf(ch);
            out += idx >= 0 && idx < to.length ? to[idx] : ch;
        }
        writeLn(out.replace(/\n$/, ""));
        return out;
    };

    commands.cut = (args, stdin) => {
        let delimiter = "\t", field = null;
        const files = [];
        for (let i = 0; i < args.length; i++) {
            if (args[i] === "-d" && args[i + 1]) delimiter = args[++i].replace(/^['"]|['"]$/g, "");
            else if (args[i] === "-f" && args[i + 1]) field = args[++i];
            else if (!args[i].startsWith("-")) files.push(args[i]);
        }
        if (!field) return writeLn("cut: you must specify a list of fields");
        let content = stdin || "";
        if (files.length) {
            const node = getNode(files[0]);
            if (!node) return writeLn(`cut: ${files[0]}: No such file or directory`);
            content = node.content;
        }
        const fieldNum = parseInt(field, 10) - 1;
        const lines = content.split("\n").filter(Boolean);
        const result = lines.map(line => {
            const parts = line.split(delimiter);
            return parts[fieldNum] !== undefined ? parts[fieldNum] : "";
        });
        const out = result.join("\n");
        writeLn(out);
        return out + "\n";
    };

    commands.tee = (args, stdin) => {
        const append = args.includes("-a");
        const files = args.filter(a => !a.startsWith("-"));
        const content = stdin || "";
        writeLn(content.replace(/\n$/, ""));
        for (const f of files) {
            const { parent, name } = getParentAndName(f);
            if (!parent) continue;
            if (append && parent.children[name]) {
                parent.children[name].content += content;
            } else {
                parent.children[name] = mkFile(content);
            }
        }
        return content;
    };

    commands.find = (args) => {
        let startDir = ".", namePattern = null;
        for (let i = 0; i < args.length; i++) {
            if (args[i] === "-name" && args[i + 1]) {
                namePattern = args[++i].replace(/^['"]|['"]$/g, "");
            } else if (!args[i].startsWith("-")) {
                startDir = args[i];
            }
        }
        const results = [];
        function walk(path, node) {
            const name = path.split("/").pop() || "/";
            if (!namePattern || matchGlob(name, namePattern)) results.push(path);
            if (node.type === "dir") {
                for (const [childName, childNode] of Object.entries(node.children)) {
                    walk(path === "." ? "./" + childName : path + "/" + childName, childNode);
                }
            }
        }
        const startNode = getNode(startDir);
        if (!startNode) return writeLn(`find: '${startDir}': No such file or directory`);
        walk(startDir, startNode);
        const out = results.join("\n");
        writeLn(out);
        return out + "\n";
    };

    function matchGlob(name, pattern) {
        const re = new RegExp("^" + pattern.replace(/\./g, "\\.").replace(/\*/g, ".*").replace(/\?/g, ".") + "$");
        return re.test(name);
    }

    commands.ln = (args) => {
        writeLn("ln: symbolic links are not supported in this simulator");
    };

    commands.whoami = () => { writeLn(env.USER); return env.USER + "\n"; };
    commands.hostname = () => { writeLn(env.HOSTNAME); return env.HOSTNAME + "\n"; };
    commands.date = () => { const d = new Date().toString(); writeLn(d); return d + "\n"; };
    commands.uname = (args) => {
        if (args.includes("-a")) {
            const out = "Linux aiunlocked 6.1.0 #1 SMP PREEMPT_DYNAMIC AI Unlocked x86_64 GNU/Linux";
            writeLn(out);
            return out + "\n";
        }
        writeLn("Linux");
        return "Linux\n";
    };
    commands.uptime = () => {
        const secs = Math.floor((Date.now() - startTime) / 1000);
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        const s = secs % 60;
        const out = ` up ${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}, 1 user, load average: 0.08, 0.03, 0.01`;
        writeLn(out);
    };

    commands.clear = () => { term.clear(); };

    commands.history = () => {
        history.forEach((cmd, i) => {
            writeLn(`  ${String(i + 1).padStart(4)}  ${cmd}`);
        });
    };

    commands.env = () => {
        for (const [k, v] of Object.entries(env)) writeLn(`${k}=${v}`);
    };
    commands.printenv = (args) => {
        if (args.length) {
            const val = env[args[0]];
            if (val !== undefined) writeLn(val);
        } else {
            commands.env();
        }
    };
    commands.export = (args) => {
        for (const a of args) {
            const eq = a.indexOf("=");
            if (eq > 0) {
                env[a.slice(0, eq)] = a.slice(eq + 1).replace(/^["']|["']$/g, "");
            }
        }
    };

    commands.alias = (args) => {
        if (!args.length) {
            for (const [k, v] of Object.entries(aliases)) writeLn(`alias ${k}='${v}'`);
            return;
        }
        for (const a of args) {
            const eq = a.indexOf("=");
            if (eq > 0) {
                aliases[a.slice(0, eq)] = a.slice(eq + 1).replace(/^["']|["']$/g, "");
            }
        }
    };
    commands.unalias = (args) => {
        for (const a of args) delete aliases[a];
    };

    commands.type = (args) => {
        if (!args.length) return;
        const cmd = args[0];
        if (aliases[cmd]) writeLn(`${cmd} is aliased to '${aliases[cmd]}'`);
        else if (commands[cmd]) writeLn(`${cmd} is a shell builtin`);
        else writeLn(`${cmd}: not found`);
    };
    commands.which = (args) => {
        if (!args.length) return;
        if (commands[args[0]]) writeLn(`/usr/bin/${args[0]}`);
        else writeLn(`${args[0]} not found`);
    };

    commands.chmod = (args) => {
        if (args.length < 2) return writeLn("chmod: missing operand");
        const mode = args[0];
        const node = getNode(args[1]);
        if (!node) return writeLn(`chmod: cannot access '${args[1]}': No such file or directory`);
        // Simple: just update the stored permissions string
        const type = node.type === "dir" ? "d" : "-";
        const perms = ["---", "--x", "-w-", "-wx", "r--", "r-x", "rw-", "rwx"];
        if (/^\d{3}$/.test(mode)) {
            const p = mode.split("").map(d => perms[parseInt(d)]).join("");
            node.permissions = type + p;
        }
    };

    commands.du = (args) => {
        const target = args.filter(a => !a.startsWith("-"))[0] || ".";
        const node = getNode(target);
        if (!node) return writeLn(`du: cannot access '${target}': No such file or directory`);
        const size = Math.ceil(nodeSize(node) / 1024);
        writeLn(`${size}\t${target}`);
    };

    commands.df = () => {
        writeLn("Filesystem     1K-blocks    Used  Available Use% Mounted on");
        writeLn("/dev/vda1       51200000  2048000   49152000   4% /");
        writeLn("tmpfs             512000        0     512000   0% /tmp");
    };

    commands.basename = (args) => {
        if (!args.length) return writeLn("basename: missing operand");
        writeLn(args[0].split("/").pop());
    };
    commands.dirname = (args) => {
        if (!args.length) return writeLn("dirname: missing operand");
        const parts = args[0].split("/");
        parts.pop();
        writeLn(parts.join("/") || ".");
    };

    commands.seq = (args) => {
        const nums = args.map(Number);
        let start = 1, step = 1, end = 1;
        if (nums.length === 1) end = nums[0];
        else if (nums.length === 2) { start = nums[0]; end = nums[1]; }
        else if (nums.length >= 3) { start = nums[0]; step = nums[1]; end = nums[2]; }
        const result = [];
        if (step > 0) for (let i = start; i <= end; i += step) result.push(String(i));
        else for (let i = start; i >= end; i += step) result.push(String(i));
        const out = result.join("\n");
        writeLn(out);
        return out + "\n";
    };

    commands.yes = () => {
        // Print a few lines to simulate (don't infinite loop!)
        for (let i = 0; i < 20; i++) writeLn("y");
        writeLn(writeColour("(stopped after 20 lines — real 'yes' runs forever)", "yellow"));
    };

    commands.true_ = () => {};
    commands.false_ = () => {};
    commands.exit = () => {
        writeLn(writeColour("Session ended. Refresh the page to start a new session.", "yellow"));
    };

    commands.man = (args) => {
        if (!args.length) return writeLn("What manual page do you want?\nFor example, try 'man ls'");
        const manPages = {
            ls: "LS(1)\n\nNAME\n  ls - list directory contents\n\nSYNOPSIS\n  ls [OPTION]... [FILE]...\n\nOPTIONS\n  -a    do not ignore entries starting with .\n  -l    use a long listing format\n  -A    almost all (ignore . and ..)",
            cd: "CD(1)\n\nNAME\n  cd - change the working directory\n\nSYNOPSIS\n  cd [DIR]\n  cd ..  (parent directory)\n  cd ~   (home directory)\n  cd -   (previous directory)",
            grep: "GREP(1)\n\nNAME\n  grep - print lines matching a pattern\n\nSYNOPSIS\n  grep [OPTIONS] PATTERN [FILE]\n\nOPTIONS\n  -i    ignore case\n  -n    show line numbers\n  -c    count matching lines\n  -v    invert match (non-matching lines)",
            find: "FIND(1)\n\nNAME\n  find - search for files in a directory hierarchy\n\nSYNOPSIS\n  find [PATH] -name PATTERN\n\nEXAMPLE\n  find . -name \"*.txt\"",
            cat: "CAT(1)\n\nNAME\n  cat - concatenate files and print on stdout\n\nSYNOPSIS\n  cat [FILE]...\n\nDESCRIPTION\n  Concatenate FILE(s) to standard output.",
            echo: "ECHO(1)\n\nNAME\n  echo - display a line of text\n\nSYNOPSIS\n  echo [STRING]...\n\nDESCRIPTION\n  Echo STRING(s) to standard output.\n  Supports $VARIABLE expansion.",
            sort: "SORT(1)\n\nNAME\n  sort - sort lines of text files\n\nOPTIONS\n  -r    reverse order\n  -n    numeric sort\n  -u    unique (remove duplicates)",
            wc: "WC(1)\n\nNAME\n  wc - word, line, character count\n\nSYNOPSIS\n  wc [FILE]...\n\nOUTPUT\n  lines  words  characters  filename",
            chmod: "CHMOD(1)\n\nNAME\n  chmod - change file mode bits\n\nSYNOPSIS\n  chmod MODE FILE\n\nEXAMPLE\n  chmod 755 script.sh\n  chmod 644 file.txt",
            head: "HEAD(1)\n\nNAME\n  head - output the first part of files\n\nSYNOPSIS\n  head [-n NUM] [FILE]\n\nOPTIONS\n  -n NUM    print first NUM lines",
            tail: "TAIL(1)\n\nNAME\n  tail - output the last part of files\n\nSYNOPSIS\n  tail [-n NUM] [FILE]\n\nOPTIONS\n  -n NUM    print last NUM lines",
        };
        const page = manPages[args[0]];
        if (page) writeLn(page);
        else writeLn(`No manual entry for ${args[0]}`);
    };

    // ── Command parser (handles pipes, redirection, aliases) ────
    function parseAndExecute(rawInput) {
        let input = rawInput.trim();
        if (!input) return;

        history.push(input);
        historyIndex = -1;

        // Expand aliases (first word only)
        const firstWord = input.split(/\s+/)[0];
        if (aliases[firstWord]) {
            input = aliases[firstWord] + input.slice(firstWord.length);
        }

        // Handle pipes
        const pipeParts = input.split(/\s*\|\s*/);
        let pipeOutput = null;

        for (let i = 0; i < pipeParts.length; i++) {
            let segment = pipeParts[i];

            // Handle output redirection (only on last segment)
            let redirectFile = null, appendMode = false;
            if (segment.includes(">>")) {
                const parts = segment.split(">>");
                segment = parts[0].trim();
                redirectFile = parts[1].trim();
                appendMode = true;
            } else if (segment.includes(">")) {
                const parts = segment.split(">");
                segment = parts[0].trim();
                redirectFile = parts[1].trim();
            }

            const tokens = tokenize(segment);
            const cmd = tokens[0];
            const args = tokens.slice(1);

            if (!cmd) continue;

            // Handle special built-ins
            if (cmd === "true") { pipeOutput = ""; continue; }
            if (cmd === "false") { pipeOutput = ""; continue; }

            const fn = commands[cmd];
            if (!fn) {
                writeLn(`${cmd}: command not found`);
                return;
            }

            // Capture output for piping / redirection
            const origWriteLn = term.writeln.bind(term);
            let captured = "";
            if (i < pipeParts.length - 1 || redirectFile) {
                term.writeln = (text) => { captured += text + "\n"; };
            }

            const result = fn(args, pipeOutput);
            pipeOutput = captured || (typeof result === "string" ? result : null);

            // Restore writeln
            term.writeln = origWriteLn;

            // Handle redirect
            if (redirectFile) {
                const content = pipeOutput || "";
                const { parent, name } = getParentAndName(redirectFile);
                if (parent) {
                    if (appendMode && parent.children[name]) {
                        parent.children[name].content += content;
                    } else {
                        parent.children[name] = mkFile(content);
                    }
                }
                pipeOutput = null;
            }

            // If last segment and had piped output that was written to terminal
            if (i === pipeParts.length - 1 && !redirectFile && captured) {
                origWriteLn(captured.replace(/\n$/, ""));
            }
        }
    }

    function tokenize(input) {
        const tokens = [];
        let current = "";
        let inQuote = null;
        for (let i = 0; i < input.length; i++) {
            const ch = input[i];
            if (inQuote) {
                if (ch === inQuote) inQuote = null;
                else current += ch;
            } else if (ch === '"' || ch === "'") {
                inQuote = ch;
            } else if (ch === " " || ch === "\t") {
                if (current) { tokens.push(current); current = ""; }
            } else {
                current += ch;
            }
        }
        if (current) tokens.push(current);
        return tokens;
    }

    // ── Prompt ──────────────────────────────────────────────────
    function getPrompt() {
        let dir = cwd;
        if (dir.startsWith(env.HOME)) dir = "~" + dir.slice(env.HOME.length);
        return `\x1b[1;32m${env.USER}@${env.HOSTNAME}\x1b[0m:\x1b[1;34m${dir}\x1b[0m$ `;
    }

    function getPromptLength() {
        let dir = cwd;
        if (dir.startsWith(env.HOME)) dir = "~" + dir.slice(env.HOME.length);
        return `${env.USER}@${env.HOSTNAME}:${dir}$ `.length;
    }

    function showPrompt() {
        term.write(getPrompt());
    }

    // ── Tab completion ──────────────────────────────────────────
    function tabComplete() {
        const tokens = tokenize(currentLine);
        const isFirstToken = tokens.length <= 1 && !currentLine.endsWith(" ");
        const partial = currentLine.endsWith(" ") ? "" : (tokens.pop() || "");

        let matches = [];

        if (isFirstToken) {
            // Complete command names
            matches = Object.keys(commands).filter(c => c.startsWith(partial));
            const aliasMatches = Object.keys(aliases).filter(a => a.startsWith(partial));
            matches = [...new Set([...matches, ...aliasMatches])];
        } else {
            // Complete file/directory names
            let dir = ".";
            let prefix = partial;
            if (partial.includes("/")) {
                const lastSlash = partial.lastIndexOf("/");
                dir = partial.slice(0, lastSlash) || "/";
                prefix = partial.slice(lastSlash + 1);
            }
            const node = getNode(dir);
            if (node && node.type === "dir") {
                matches = Object.keys(node.children)
                    .filter(name => name.startsWith(prefix))
                    .map(name => {
                        const child = node.children[name];
                        const fullName = partial.includes("/")
                            ? partial.slice(0, partial.lastIndexOf("/") + 1) + name
                            : name;
                        return child.type === "dir" ? fullName + "/" : fullName;
                    });
            }
        }

        if (matches.length === 1) {
            const completion = matches[0].slice(partial.length);
            const suffix = isFirstToken ? " " : "";
            currentLine += completion + suffix;
            cursorPos += completion.length + suffix.length;
            term.write(completion + suffix);
        } else if (matches.length > 1) {
            // Show options
            writeLn("");
            writeLn(matches.join("  "));
            showPrompt();
            term.write(currentLine);
            cursorPos = currentLine.length;
        }
    }

    // ── Input handling ──────────────────────────────────────────
    function clearCurrentLine() {
        // Move to start of input, clear to end
        term.write("\r");
        term.write(getPrompt());
        term.write("\x1b[K"); // clear to end of line
    }

    term.onKey(({ key, domEvent }) => {
        const ev = domEvent;
        const code = ev.keyCode;

        // Ctrl+C — cancel
        if (ev.ctrlKey && code === 67) {
            term.write("^C");
            currentLine = "";
            cursorPos = 0;
            writeLn("");
            showPrompt();
            return;
        }

        // Ctrl+L — clear
        if (ev.ctrlKey && code === 76) {
            term.clear();
            showPrompt();
            term.write(currentLine);
            return;
        }

        // Tab
        if (code === 9) {
            ev.preventDefault();
            tabComplete();
            return;
        }

        // Enter
        if (code === 13) {
            writeLn("");
            if (currentLine.trim()) {
                parseAndExecute(currentLine);
            }
            currentLine = "";
            cursorPos = 0;
            showPrompt();
            return;
        }

        // Backspace
        if (code === 8) {
            if (cursorPos > 0) {
                currentLine = currentLine.slice(0, cursorPos - 1) + currentLine.slice(cursorPos);
                cursorPos--;
                clearCurrentLine();
                term.write(currentLine);
                // Move cursor to right position
                const moveBack = currentLine.length - cursorPos;
                if (moveBack > 0) term.write(`\x1b[${moveBack}D`);
            }
            return;
        }

        // Delete
        if (code === 46) {
            if (cursorPos < currentLine.length) {
                currentLine = currentLine.slice(0, cursorPos) + currentLine.slice(cursorPos + 1);
                clearCurrentLine();
                term.write(currentLine);
                const moveBack = currentLine.length - cursorPos;
                if (moveBack > 0) term.write(`\x1b[${moveBack}D`);
            }
            return;
        }

        // Arrow Up — history
        if (code === 38) {
            if (history.length === 0) return;
            if (historyIndex === -1) historyIndex = history.length;
            if (historyIndex > 0) {
                historyIndex--;
                currentLine = history[historyIndex];
                cursorPos = currentLine.length;
                clearCurrentLine();
                term.write(currentLine);
            }
            return;
        }

        // Arrow Down — history
        if (code === 40) {
            if (historyIndex === -1) return;
            if (historyIndex < history.length - 1) {
                historyIndex++;
                currentLine = history[historyIndex];
            } else {
                historyIndex = -1;
                currentLine = "";
            }
            cursorPos = currentLine.length;
            clearCurrentLine();
            term.write(currentLine);
            return;
        }

        // Arrow Left
        if (code === 37) {
            if (cursorPos > 0) {
                cursorPos--;
                term.write(key);
            }
            return;
        }

        // Arrow Right
        if (code === 39) {
            if (cursorPos < currentLine.length) {
                cursorPos++;
                term.write(key);
            }
            return;
        }

        // Home
        if (code === 36) {
            if (cursorPos > 0) {
                term.write(`\x1b[${cursorPos}D`);
                cursorPos = 0;
            }
            return;
        }

        // End
        if (code === 35) {
            if (cursorPos < currentLine.length) {
                term.write(`\x1b[${currentLine.length - cursorPos}C`);
                cursorPos = currentLine.length;
            }
            return;
        }

        // Regular printable character
        if (!ev.ctrlKey && !ev.altKey && !ev.metaKey && key.length === 1) {
            currentLine = currentLine.slice(0, cursorPos) + key + currentLine.slice(cursorPos);
            cursorPos++;
            // Rewrite from cursor position
            clearCurrentLine();
            term.write(currentLine);
            const moveBack = currentLine.length - cursorPos;
            if (moveBack > 0) term.write(`\x1b[${moveBack}D`);
        }
    });

    // Handle paste
    term.onData((data) => {
        // Only handle pasted multi-char data (not single keypresses, those are handled by onKey)
        if (data.length > 1 && !data.startsWith("\x1b")) {
            // It's a paste
            const clean = data.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
            const lines = clean.split("\n");
            for (let i = 0; i < lines.length; i++) {
                currentLine += lines[i];
                cursorPos += lines[i].length;
                clearCurrentLine();
                term.write(currentLine);
                if (i < lines.length - 1 && lines[i + 1] !== undefined) {
                    // Simulate Enter for multi-line paste
                    writeLn("");
                    if (currentLine.trim()) parseAndExecute(currentLine);
                    currentLine = "";
                    cursorPos = 0;
                    showPrompt();
                }
            }
        }
    });

    // ── Toolbar buttons ─────────────────────────────────────────
    document.getElementById("btnReset").addEventListener("click", () => {
        term.clear();
        currentLine = "";
        cursorPos = 0;
        history.length = 0;
        historyIndex = -1;
        cwd = env.HOME;
        env.PWD = cwd;
        showBanner();
        showPrompt();
        term.focus();
    });

    document.getElementById("btnFullscreen").addEventListener("click", () => {
        const wrapper = document.getElementById("terminalWrapper");
        wrapper.classList.toggle("fullscreen");
        setTimeout(() => { fitAddon.fit(); term.focus(); }, 100);
    });

    document.getElementById("btnHelp").addEventListener("click", () => {
        writeLn("");
        commands.help();
        showPrompt();
        term.focus();
    });

    // ── Welcome banner ──────────────────────────────────────────
    function showBanner() {
        const banner = [
            "",
            writeColour("  ╔═══════════════════════════════════════════════════════╗", "brightCyan"),
            writeColour("  ║", "brightCyan") + writeColour("        🐧 AI Unlocked Linux Terminal v1.0           ", "brightYellow") + writeColour("║", "brightCyan"),
            writeColour("  ║", "brightCyan") + "   Practice Linux commands right in your browser!    " + writeColour("║", "brightCyan"),
            writeColour("  ║", "brightCyan") + "                                                     " + writeColour("║", "brightCyan"),
            writeColour("  ║", "brightCyan") + "   Type " + writeColour("help", "green") + " for commands  •  " + writeColour("man <cmd>", "green") + " for details   " + writeColour("║", "brightCyan"),
            writeColour("  ║", "brightCyan") + "   " + writeColour("Tab", "green") + " to auto-complete  •  " + writeColour("↑↓", "green") + " for history        " + writeColour("║", "brightCyan"),
            writeColour("  ╚═══════════════════════════════════════════════════════╝", "brightCyan"),
            "",
            "  " + writeColour("Try:", "yellow") + " cat welcome.txt  •  ls -la  •  grep ERROR data/log.txt",
            "",
        ];
        banner.forEach(line => writeLn(line));
    }

    // ── Boot ────────────────────────────────────────────────────
    showBanner();
    showPrompt();
    term.focus();

    // Focus terminal when clicking the wrapper
    document.getElementById("terminalWrapper").addEventListener("click", () => term.focus());

})();
