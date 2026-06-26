"use strict";
// ModeratorButtons — Kettu/Bunny/Vendetta plugin
// Стратегия: найти компонент секции "Действия модератора" и убрать
// проверку прав, чтобы она показывалась всегда (disabled если нет прав)

const { findByProps, findByDisplayName } = require("@vendetta/metro");
const { before, after, instead } = require("@vendetta/patcher");
const { React, ReactNative: { View, Text, StyleSheet, TouchableOpacity, Alert } } = require("@vendetta/metro/common");

const PermissionStore  = findByProps("can", "canManageUser");
const Permissions      = findByProps("KICK_MEMBERS", "BAN_MEMBERS");
const GuildActions     = findByProps("kickUser", "banUser");
const ModerationStore  = findByProps("timeout", "removeTimeout");
const SelectedGuild    = findByProps("getGuildId", "getLastSelectedGuildId");
const GuildMemberStore = findByProps("getMember", "getMembers");
const UserStore        = findByProps("getCurrentUser");

const patches = [];

function hasPerm(guildId, perm) {
    try { return PermissionStore?.can?.(perm, { guild_id: guildId }) === true; }
    catch { return false; }
}

function confirm(title, msg, action) {
    Alert.alert(title, msg, [
        { text: "Отмена", style: "cancel" },
        { text: "Подтвердить", style: "destructive", onPress: () => {
            try { action(); } catch (e) { Alert.alert("Ошибка", String(e)); }
        }},
    ]);
}

// ── Стили для fallback-кнопок (если нативный UI не найден) ──────────────────
const styles = StyleSheet.create({
    section: { marginHorizontal: 12, marginVertical: 6, borderRadius: 12, backgroundColor: "#1e1f22", overflow: "hidden" },
    sectionTitle: { color: "#b5bac1", fontSize: 12, fontWeight: "700", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
    row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14 },
    rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#2b2d31" },
    icon: { fontSize: 18, marginRight: 14, width: 24, textAlign: "center" },
    rowLabel: { fontSize: 16, fontWeight: "500", color: "#dbdee1" },
    rowLabelDanger: { color: "#f23f43" },
    rowLabelDisabled: { color: "#4e5058" },
});

function FallbackModSection({ userId, guildId }) {
    const canManage  = hasPerm(guildId, Permissions?.MANAGE_MEMBERS ?? 0n);
    const canTimeout = hasPerm(guildId, Permissions?.MODERATE_MEMBERS ?? 0n);
    const canKick    = hasPerm(guildId, Permissions?.KICK_MEMBERS ?? 0n);
    const canBan     = hasPerm(guildId, Permissions?.BAN_MEMBERS ?? 0n);

    function Row({ icon, label, danger, can, onPress, border }) {
        return React.createElement(
            TouchableOpacity,
            { style: [styles.row, border && styles.rowBorder], activeOpacity: can ? 0.6 : 1, onPress: can ? onPress : undefined },
            React.createElement(Text, { style: [styles.icon, !can && { color: "#4e5058" }] }, icon),
            React.createElement(Text, { style: [styles.rowLabel, danger && styles.rowLabelDanger, !can && styles.rowLabelDisabled] }, label)
        );
    }

    return React.createElement(
        View, { style: styles.section },
        React.createElement(Text, { style: styles.sectionTitle }, "Действия модератора"),
        Row({ icon: "⚙️", label: "Управление", danger: false, can: canManage,  border: false,
              onPress: () => Alert.alert("Управление", "Перейдите в настройки участника") }),
        Row({ icon: "⏱", label: "Тайм-аут",  danger: false, can: canTimeout, border: true,
              onPress: () => confirm("Тайм-аут 10 мин", "Дать тайм-аут?", () => {
                  ModerationStore?.timeout(guildId, userId, new Date(Date.now() + 10*60*1000).toISOString());
              }) }),
        Row({ icon: "👢", label: "Выгнать",   danger: true,  can: canKick,    border: true,
              onPress: () => confirm("Выгнать", "Выгнать пользователя с сервера?", () => GuildActions?.kickUser(guildId, userId)) }),
        Row({ icon: "🔨", label: "Забанить",  danger: true,  can: canBan,     border: true,
              onPress: () => confirm("Забанить", "Забанить пользователя?", () => GuildActions?.banUser(guildId, userId, 1)) })
    );
}

// ── Стратегия 1: патч компонента, который скрывает/показывает секцию ─────────
// Discord рендерит что-то вроде: canKick || canBan || canTimeout ? <ModSection/> : null
// Ищем по findByProps с характерными ключами

function tryPatchByProps(...propNames) {
    const mod = findByProps(...propNames);
    if (!mod) return false;

    for (const key of Object.keys(mod)) {
        if (typeof mod[key] !== "function") continue;
        const src = mod[key].toString();
        // Ищем функции, которые проверяют canKick/canBan и что-то рендерят
        if (!(src.includes("canKick") || src.includes("KICK_MEMBERS") || src.includes("kickUser") || src.includes("ModerationAction"))) continue;

        const unpatch = instead(key, mod, (args, orig) => {
            // Подменяем проверки прав на true
            if (args[0] && typeof args[0] === "object") {
                const fakeArgs = { ...args[0], canKick: true, canBan: true, canTimeout: true, canManageMember: true };
                return orig(fakeArgs, ...args.slice(1));
            }
            return orig(...args);
        });
        patches.push(unpatch);
        return true;
    }
    return false;
}

// ── Стратегия 2: патч UserSheet/профиля — добавляем секцию если её нет ──────
function tryPatchProfileSheet() {
    const NAMES = [
        "UserProfileSheet", "UserSheet", "UserProfile",
        "UserInfoBase", "UserInfo", "MemberSafetySection",
        "UserProfileBody", "ProfileBody",
    ];

    for (const name of NAMES) {
        const comp = findByDisplayName(name) ?? findByProps(name)?.[name];
        if (!comp) continue;

        const target = comp.default ? comp : { default: comp };
        if (typeof target.default !== "function") continue;

        const unpatch = after("default", target, (args, res) => {
            if (!res) return res;
            const userId = args?.[0]?.userId ?? args?.[0]?.user?.id ?? res?.props?.userId;
            if (!userId) return res;

            const guildId = SelectedGuild?.getGuildId?.();
            if (!guildId) return res;

            const me = UserStore?.getCurrentUser?.();
            if (!me || me.id === userId) return res;

            const member = GuildMemberStore?.getMember?.(guildId, userId);
            if (!member) return res;

            // Проверяем — есть ли уже секция модератора в дереве (если ты модер)
            const resStr = JSON.stringify(res)?.toLowerCase() ?? "";
            const hasModSection = resStr.includes("moderat") || resStr.includes("kickuser") || resStr.includes("banuser");
            if (hasModSection) return res; // уже есть — не дублируем

            const modNode = React.createElement(FallbackModSection, { key: "mod-section", userId, guildId });
            const kids = res?.props?.children;
            if (Array.isArray(kids)) {
                // Вставляем после первых 2 элементов (после кнопок Add Friend, Message etc)
                const insertIdx = Math.min(2, kids.length);
                const newKids = [...kids.slice(0, insertIdx), modNode, ...kids.slice(insertIdx)];
                return { ...res, props: { ...res.props, children: newKids } };
            }
            return React.createElement(React.Fragment, null, res, modNode);
        });

        patches.push(unpatch);
        return true;
    }
    return false;
}

// ── Стратегия 3: патч самого условия — ищем модуль с проверкой canKick ──────
function tryPatchPermCheck() {
    // Ищем модуль который решает показывать ли секцию
    const candidates = [
        findByProps("canKick", "canBan"),
        findByProps("kickUser", "canKick"),
        findByProps("ModerationActionKick"),
        findByProps("ModerationActionBan"),
    ];

    for (const mod of candidates) {
        if (!mod) continue;
        for (const key of ["canKick", "canBan", "canTimeout", "canManageMember"]) {
            if (key in mod && typeof mod[key] === "function") {
                const unpatch = instead(key, mod, () => true);
                patches.push(unpatch);
            }
        }
        if (patches.length > 0) return true;
    }
    return false;
}

// Запускаем все стратегии
tryPatchByProps("canKick", "canBan");
tryPatchByProps("kickUser", "banUser");
tryPatchPermCheck();
tryPatchProfileSheet();

module.exports = {
    default: {
        onLoad() {},
        onUnload() {
            patches.forEach(p => { try { p(); } catch {} });
            patches.length = 0;
        },
    }
};
