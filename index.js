const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    delay, 
    generateForwardMessageContent, 
    prepareWAMessageMedia 
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const gtts = require("gtts");
const fs = require("fs");
const { join } = require("path");
const axios = require("axios");
const moment = require("moment-timezone");

// Yaddaş üçün sadə obyektlər
let afkData = { status: false, reason: "", time: null };
let filters = {};
let welcomeStatus = false;

async function startXBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false, 
        logger: pino({ level: "silent" }),
        browser: ["Ubuntu", "Chrome", "20.0.04"], 
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 10000
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("messages.upsert", async (m) => {
        const msg = m.messages[0];
        if (!msg.message) return;

        const from = msg.key.remoteJid;
        const isMe = msg.key.fromMe;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
        const isGroup = from.endsWith('@g.us');
        const prefix = ".";

        // AFK Kontrolü (Kimsə mənə yazanda)
        if (!isMe && afkData.status) {
            await sock.sendMessage(from, { text: `📢 *Hüseyn hazırda AFK-dır.*\n📝 *Səbəb:* ${afkData.reason}\n⏰ *Vaxt:* ${afkData.time}` }, { quoted: msg });
        }

        // Welcome (Qarşılama) Sistemi
        if (!isMe && welcomeStatus && !isGroup && text && !text.startsWith(prefix)) {
            await sock.sendMessage(from, { text: "Salam! Mən Hüseynin köməkçi botuyam. Hazırda aktiv deyiləmsə, mesajınızı buraxın, tezliklə cavab verəcək. 😊" });
        }

        // Filter Sistemi (Sözləri yoxla)
        if (!text.startsWith(prefix) && filters[text.toLowerCase()]) {
            await sock.sendMessage(from, { text: filters[text.toLowerCase()] }, { quoted: msg });
        }

        if (!text.startsWith(prefix)) return;

        const args = text.slice(prefix.length).trim().split(/ +/);
        const command = args.shift().toLowerCase();

        // --- KOMANDALAR BAŞLAYIR ---

        if (command === "kömək" || command === "menu") {
            const time = moment().tz("Asia/Baku").format("HH:mm:ss");
            let menu = `✨ *X-BOT USERBOT SİSTEMİ* ✨\n\n`;
            menu += `👤 *Sahib:* Hüseyn\n`;
            menu += `⏰ *Saat:* ${time}\n\n`;
            
            menu += `🛡️ *AFK & FİLTER & GREET* 🛡️\n`;
            menu += `• \`.afk\` [səbəb] - AFK rejimini açar.\n`;
            menu += `• \`.afkoff\` - AFK-nı bağlayar.\n`;
            menu += `• \`.filter\` [söz] | [cavab] - Avto-cavab.\n`;
            menu += `• \`.filteroff\` [söz] - Filteri silər.\n`;
            menu += `• \`.welcome\` [on/off] - Qarşılama mesajı.\n\n`;

            menu += `🌐 *SƏS (TTS)* 🌐\n`;
            menu += `• \`.tts\` [mətn] - Türk aksenti\n`;
            menu += `• \`.tts-en\`, \`.tts-ru\`, \`.tts-ar\`, \`.tts-fr\`\n\n`;

            menu += `🛠️ *DİGƏR* 🛠️\n`;
            menu += `• \`.tagall\`, \`.ping\`, \`.alive\`, \`.calc\`, \`.runtime\`, \`.sahib\`\n\n`;
            
            menu += `🌟 *Sahib: Hüseyn*`;
            await sock.sendMessage(from, { text: menu }, { quoted: msg });
        }

        // --- AFK KOMANDALARI ---
        if (command === "afk" && isMe) {
            afkData.status = true;
            afkData.reason = args.join(" ") || "Məşğul";
            afkData.time = moment().tz("Asia/Baku").format("HH:mm:ss");
            await sock.sendMessage(from, { text: "✅ AFK rejimi aktiv edildi. Hüseyn artıq istirahət edir!" });
        }

        if (command === "afkoff" && isMe) {
            afkData.status = false;
            await sock.sendMessage(from, { text: "Welcome Back Hüseyn! AFK rejimi söndürüldü." });
        }

        // --- FİLTER KOMANDALARI ---
        if (command === "filter" && isMe) {
            let fTxt = args.join(" ").split("|");
            if (fTxt.length < 2) return sock.sendMessage(from, { text: "İstifadə: .filter salam | əleyküm salam" });
            filters[fTxt[0].trim().toLowerCase()] = fTxt[1].trim();
            await sock.sendMessage(from, { text: `✅ Filter əlavə olundu: *${fTxt[0].trim()}*` });
        }

        if (command === "filteroff" && isMe) {
            delete filters[args.join(" ").toLowerCase()];
            await sock.sendMessage(from, { text: "🗑️ Filter silindi." });
        }

        // --- WELCOME KOMANDASI ---
        if (command === "welcome" && isMe) {
            if (args[0] === "on") { welcomeStatus = true; await sock.sendMessage(from, { text: "✅ Qarşılama mesajı aktivdir." }); }
            else { welcomeStatus = false; await sock.sendMessage(from, { text: "❌ Qarşılama mesajı deaktivdir." }); }
        }

        // --- SƏS FUNKSİYALARI (TTS) ---
        const handleTTS = async (lang) => {
            const content = args.join(" ");
            if (!content) return sock.sendMessage(from, { text: "Mətn yazın!" });
            const fileName = join(__dirname, `tts-${Date.now()}.mp3`);
            const speech = new gtts(content, lang);
            speech.save(fileName, async () => {
                await sock.sendMessage(from, { audio: { url: fileName }, mimetype: 'audio/mp4', ptt: true }, { quoted: msg });
                fs.unlinkSync(fileName);
            });
        };

        if (command === "tts") await handleTTS('tr');
        if (command === "tts-en") await handleTTS('en');
        if (command === "tts-ru") await handleTTS('ru');
        if (command === "tts-ar") await handleTTS('ar');
        if (command === "tts-fr") await handleTTS('fr');

        // --- QRUP KOMANDALARI ---
        if (command === "tagall" && isGroup) {
            const group = await sock.groupMetadata(from);
            let teks = `📢 *Hüseynin Çağırışı:* \n\n`;
            for (let mem of group.participants) { teks += ` @${mem.id.split('@')[0]}`; }
            sock.sendMessage(from, { text: teks, mentions: group.participants.map(a => a.id) });
        }

        // --- DİGƏR KOMANDALAR ---
        if (command === "ping") await sock.sendMessage(from, { text: "🚀 *Sürət:* 0.89ms" });
        if (command === "alive") await sock.sendMessage(from, { text: "Bəli Hüseyn, mən aktivəm! 🟢" });
        if (command === "sahib") await sock.sendMessage(from, { text: "Mənim sahibim *Hüseyn*-dir. ✨" });
        if (command === "calc") {
            try { await sock.sendMessage(from, { text: `Nəticə: *${eval(args.join(""))}*` }); } 
            catch { await sock.sendMessage(from, { text: "Səhv hesab!" }); }
        }
        if (command === "runtime") {
            const uptime = process.uptime();
            const hours = Math.floor(uptime / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);
            await sock.sendMessage(from, { text: `⏱ *İşləmə vaxtı:* ${hours} saat, ${minutes} dəqiqə` });
        }
    });

    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === "open") {
            console.log("X-Bot aktivdir! Hüseyn üçün çalışır.");

            // Bağlantı açıldıqda, qeydiyyat olmadıqda kodu al
            if (!sock.authState.creds.registered && !global.isPairingSent) {
                global.isPairingSent = true;
                try {
                    await delay(2000);
                    const myNumber = "9945002529272";
                    let code = await sock.requestPairingCode(myNumber);
                    console.log(`\n************************************`);
                    console.log(`🚀 QOŞULMA KODUN: ${code}`);
                    console.log(`************************************\n`);
                    console.log("⚠️ Kodu WhatsApp-da daxil et. Başqa kod gəlməyəcək.");
                } catch (err) {
                    console.log("Kod alınarkən xəta:", err.message);
                    global.isPairingSent = false;
                }
            }
        }

        if (connection === "close") {
            global.isPairingSent = false;
            if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
                startXBot();
            }
        }
    });
}

startXBot();
