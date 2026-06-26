"use strict";
// ModeratorButtons — Kettu/Bunny/Vendetta plugin
// Правильная структура: @vendetta/* как внешние модули через require()

const { findByProps, findByDisplayName } = require("@vendetta/metro");
const { after } = require("@vendetta/patcher");
const { React, ReactNative: { View, Text, StyleSheet, TouchableOpacity, Alert } } = require("@vendetta/metro/common");

// ── Discord модули ────────────────────────────────────────────────────────────
const PermissionStore  = findByProps("can", "canManageUser");
const Permissions      = findByProps("KICK_MEMBERS", "BAN_MEMBERS");
const GuildActions     = findByProps("kickUser", "banUser");
const ModerationStore  = findByProps("timeout", "removeTimeout");
const SelectedGuild    = findByProps("getGuildId", "getLastSelectedGuildId");
const GuildMemberStore = findByProps("getMember", "getMembers");
const UserStore        = findByProps("getCurrentUser");

// ── Стили ─────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  btn: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: { opacity: 0.38 },
  label: { color: "#fff", fontSize: 13, fontWeight: "600" },
});

// ── Хелперы ───────────────────────────────────────────────────────────────────
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

// ── Кнопки модератора ─────────────────────────────────────────────────────────
function ModButtons({ userId }) {
  const guildId = SelectedGuild?.getGuildId?.() ?? null;
  if (!guildId) return null;

  const me = UserStore?.getCurrentUser?.();
  if (!me || me.id === userId) return null;

  const member = GuildMemberStore?.getMember?.(guildId, userId);
  if (!member) return null;

  const canKick    = hasPerm(guildId, Permissions?.KICK_MEMBERS);
  const canBan     = hasPerm(guildId, Permissions?.BAN_MEMBERS);
  const canTimeout = hasPerm(guildId, Permissions?.MODERATE_MEMBERS);

  function Btn({ label, color, can, onPress }) {
    return React.createElement(
      TouchableOpacity,
      {
        style: [styles.btn, { backgroundColor: color }, !can && styles.disabled],
        activeOpacity: can ? 0.7 : 1,
        onPress: can ? onPress : undefined,
      },
      React.createElement(Text, { style: styles.label }, label)
    );
  }

  return React.createElement(
    View, { style: styles.row },
    React.createElement(Btn, {
      label: "⚡ Кик", color: "#FAA61A", can: canKick,
      onPress: () => confirm("Кик", "Выгнать пользователя?", () => GuildActions?.kickUser(guildId, userId)),
    }),
    React.createElement(Btn, {
      label: "🔨 Бан", color: "#ED4245", can: canBan,
      onPress: () => confirm("Бан", "Забанить пользователя?", () => GuildActions?.banUser(guildId, userId, 1)),
    }),
    React.createElement(Btn, {
      label: "⏱ Тайм", color: "#5865F2", can: canTimeout,
      onPress: () => confirm("Таймаут 10 мин", "Дать таймаут?", () => {
        const until = new Date(Date.now() + 10 * 60 * 1000).toISOString();
        ModerationStore?.timeout(guildId, userId, until);
      }),
    })
  );
}

// ── Патчи ─────────────────────────────────────────────────────────────────────
const patches = [];

function patchSheet(comp) {
  if (!comp) return false;
  const obj   = comp.default ? comp : { default: comp };
  const orig  = obj.default;
  if (typeof orig !== "function") return false;

  const unpatch = after("default", obj, (args, res) => {
    if (!res) return res;
    const userId =
      args?.[0]?.userId ??
      args?.[0]?.user?.id ??
      res?.props?.userId ??
      res?.props?.user?.id;
    if (!userId) return res;

    const node = React.createElement(ModButtons, { key: "mod-btns", userId });
    const kids = res?.props?.children;
    if (Array.isArray(kids)) {
      if (!kids.some(c => c?.key === "mod-btns")) kids.push(node);
      return res;
    }
    return React.createElement(React.Fragment, null, res, node);
  });

  patches.push(unpatch);
  return true;
}

// Пробуем разные имена компонента профиля
const NAMES = [
  "UserProfileSheet",
  "UserSheet",
  "UserInfoBase",
  "UserInfo",
  "UserProfileActionRow",
];

for (const name of NAMES) {
  const byName = findByDisplayName(name);
  if (byName && patchSheet(byName)) break;

  const byProps = findByProps(name);
  if (byProps) {
    const obj = { default: byProps[name] };
    if (patchSheet(obj)) break;
  }
}

// ── Экспорт ───────────────────────────────────────────────────────────────────
module.exports = {
  default: {
    onLoad() {},
    onUnload() {
      patches.forEach(p => { try { p(); } catch {} });
      patches.length = 0;
    },
  }
};
