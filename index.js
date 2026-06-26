"use strict";
// DIAGNOSTIC PLUGIN — находит компоненты профиля и показывает в Alert

const { findByProps, findByDisplayName, getAssetIDByName } = require("@vendetta/metro");
const { after } = require("@vendetta/patcher");
const { React, ReactNative: { Alert } } = require("@vendetta/metro/common");

const patches = [];
let alerted = false;

// Ищем модули связанные с профилем и модерацией
function findRelevantModules() {
    const results = [];

    const searchTerms = [
        ["canKick", "canBan"],
        ["kickUser", "banUser"],
        ["KICK_MEMBERS", "BAN_MEMBERS"],
        ["ModerationSection"],
        ["moderatorActions"],
        ["UserProfileSheet"],
        ["UserSheet"],
        ["UserProfile"],
        ["UserProfileBody"],
        ["MemberSafety"],
        ["ProfileBody"],
        ["UserSummaryItem"],
    ];

    for (const terms of searchTerms) {
        try {
            const mod = findByProps(...terms);
            if (mod) {
                const keys = Object.keys(mod).filter(k => typeof mod[k] === "function").slice(0, 5);
                results.push(`[${terms.join(",")}] → keys: ${keys.join(", ")}`);
            }
        } catch {}
    }

    const displayNames = [
        "UserProfileSheet", "UserSheet", "UserProfile",
        "UserProfileBody", "ProfileBody", "UserInfoBase",
        "UserInfo", "MemberCard", "UserCard",
        "ModerationSection", "ModeratorActions",
    ];

    for (const name of displayNames) {
        try {
            const comp = findByDisplayName(name);
            if (comp) results.push(`displayName: ${name} FOUND`);
        } catch {}
    }

    return results;
}

// Патчим профиль чтобы поймать дерево компонентов
function scanTree(node, depth, results) {
    if (!node || depth > 4) return;
    if (typeof node !== "object") return;

    const type = node.type;
    if (type) {
        const name = type.displayName || type.name || (typeof type === "string" ? type : null);
        if (name && name.length > 2 && !["View","Text","TouchableOpacity","Animated"].includes(name)) {
            results.add(name);
        }
    }
    const kids = node.props?.children;
    if (Array.isArray(kids)) kids.forEach(k => scanTree(k, depth+1, results));
    else if (kids) scanTree(kids, depth+1, results);
}

// Пробуем поймать через findByProps с широким поиском
const UserStore = findByProps("getCurrentUser");
const SelectedGuild = findByProps("getGuildId", "getLastSelectedGuildId");

// Патчим React.createElement чтобы поймать нужные компоненты
let capturedNames = new Set();
let patchCount = 0;

const origCreate = React.createElement.bind(React);
React.createElement = function(type, props, ...children) {
    if (patchCount < 5000 && props && typeof type === "function") {
        const name = type.displayName || type.name;
        if (name && props.userId) {
            capturedNames.add(`${name} (has userId)`);
        }
        if (name && (props.guildId || props.guild_id)) {
            capturedNames.add(`${name} (has guildId)`);
        }
        if (name && (String(props).includes("kick") || String(name).toLowerCase().includes("moderat"))) {
            capturedNames.add(`MOD: ${name}`);
        }
        patchCount++;
    }
    return origCreate(type, props, ...children);
};

patches.push(() => { React.createElement = origCreate; });

// Через 5 секунд показываем что нашли
setTimeout(() => {
    if (alerted) return;
    alerted = true;

    const modResults = findRelevantModules();
    const captured = Array.from(capturedNames).slice(0, 20);

    const msg = [
        "=== MODULES ===",
        ...modResults.slice(0, 10),
        "",
        "=== CAPTURED ===",
        ...captured,
    ].join("\n");

    Alert.alert("ModDiag", msg);
}, 5000);

// Через 15 сек — второй алерт с именами компонентов из дерева
setTimeout(() => {
    const msg2 = Array.from(capturedNames).join("\n") || "nothing captured";
    Alert.alert("ModDiag2", msg2.slice(0, 1000));
}, 15000);

module.exports = {
    default: {
        onLoad() {},
        onUnload() {
            patches.forEach(p => { try { p(); } catch {} });
            patches.length = 0;
            React.createElement = origCreate;
        },
    }
};
