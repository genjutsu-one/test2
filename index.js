// ModeratorButtons — Kettu / Bunny / Vendetta plugin
// Готовый bundle для установки через URL

"use strict";

// Vendetta API доступен как глобальный объект `vendetta`
const { findByProps, findByDisplayName } = vendetta.metro;
const { after } = vendetta.patcher;
const { React } = vendetta.metro.common;

// ── Discord internal modules ──────────────────────────────────────────────────
const PermissionStore  = findByProps("can", "canManageUser");
const Permissions      = findByProps("KICK_MEMBERS", "BAN_MEMBERS");
const GuildActions     = findByProps("kickUser", "banUser");
const ModerationStore  = findByProps("timeout", "removeTimeout");
const SelectedGuild    = findByProps("getGuildId", "getLastSelectedGuildId");
const GuildMemberStore = findByProps("getMember", "getMembers");
const UserStore        = findByProps("getCurrentUser");

// React Native компоненты
const RN = vendetta.metro.common.ReactNative
  ?? findByProps("StyleSheet", "Alert")
  ?? findByProps("TouchableOpacity");

const { TouchableOpacity, View, Text, StyleSheet, Alert } = RN;

// ── Стили ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  row: {
    flexDirection: "row",
    gap: 8,
  },
  btn: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  kick:    { backgroundColor: "#FAA61A" },
  ban:     { backgroundColor: "#ED4245" },
  timeout: { backgroundColor: "#5865F2" },
  disabled: { opacity: 0.38 },
  label: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
  },
});

// ── Хелперы ───────────────────────────────────────────────────────────────────
function hasPerm(guildId, perm) {
  try {
    return PermissionStore?.can?.(perm, { guild_id: guildId }) === true;
  } catch {
    return false;
  }
}

function ask(title, msg, action) {
  Alert.alert(title, msg, [
    { text: "Отмена", style: "cancel" },
    { text: "Подтвердить", style: "destructive", onPress: () => {
      try { action(); }
      catch (e) { Alert.alert("Ошибка", String(e)); }
    }},
  ]);
}

// ── Mod-actions ───────────────────────────────────────────────────────────────
function doKick(guildId, userId) {
  ask("⚡ Кик", "Выгнать пользователя с сервера?", () =>
    GuildActions?.kickUser(guildId, userId)
  );
}

function doBan(guildId, userId) {
  ask("🔨 Бан", "Забанить пользователя (удалить сообщения за 24ч)?", () =>
    GuildActions?.banUser(guildId, userId, 1)
  );
}

function doTimeout(guildId, userId) {
  const until = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  ask("⏱ Таймаут", "Дать таймаут на 10 минут?", () =>
    ModerationStore?.timeout(guildId, userId, until)
  );
}

// ── Компонент кнопок ─────────────────────────────────────────────────────────
function ModButtons({ userId }) {
  const guildId = SelectedGuild?.getGuildId?.() ?? null;
  if (!guildId) return null;

  // Не показываем на своём профиле
  const me = UserStore?.getCurrentUser?.();
  if (!me || me.id === userId) return null;

  // Только если пользователь — участник текущего сервера
  const member = GuildMemberStore?.getMember?.(guildId, userId);
  if (!member) return null;

  const canKick    = hasPerm(guildId, Permissions?.KICK_MEMBERS);
  const canBan     = hasPerm(guildId, Permissions?.BAN_MEMBERS);
  const canTimeout = hasPerm(guildId, Permissions?.MODERATE_MEMBERS);

  // Кнопка-фабрика
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
    View, { style: styles.container },
    React.createElement(
      View, { style: styles.row },
      Btn({ label: "⚡ Кик",    color: "#FAA61A", can: canKick,    onPress: () => doKick(guildId, userId) }),
      Btn({ label: "🔨 Бан",    color: "#ED4245", can: canBan,     onPress: () => doBan(guildId, userId) }),
      Btn({ label: "⏱ Таймаут", color: "#5865F2", can: canTimeout, onPress: () => doTimeout(guildId, userId) })
    )
  );
}

// ── Список всех патчей (для очистки при выгрузке) ────────────────────────────
const patches = [];

// ── Вспомогательная функция патча ────────────────────────────────────────────
function patchComp(obj, key, getUserId) {
  if (!obj || typeof obj[key] !== "function") return false;

  const unpatch = after(key, obj, (args, res) => {
    if (!res) return res;
    const userId = getUserId(args, res);
    if (!userId) return res;

    const modRow = React.createElement(ModButtons, { key: "kettu-mod-btns", userId });
    const kids = res?.props?.children;

    if (Array.isArray(kids)) {
      if (!kids.some(c => c?.key === "kettu-mod-btns")) {
        kids.push(modRow);
      }
      return res;
    }

    return React.createElement(React.Fragment, null, res, modRow);
  });

  patches.push(unpatch);
  return true;
}

// ── Основная логика патчинга ──────────────────────────────────────────────────
const SHEET_NAMES = [
  "UserProfileSheet",
  "UserSheet",
  "UserInfoBase",
  "UserInfo",
  "UserProfileActionRow",
];

let didPatch = false;

for (const name of SHEET_NAMES) {
  const comp = findByDisplayName(name);
  if (!comp) continue;

  const obj = comp.default ? comp : { default: comp };
  const ok = patchComp(obj, "default", (args, res) =>
    args?.[0]?.userId ?? args?.[0]?.user?.id ?? res?.props?.userId ?? res?.props?.user?.id
  );
  if (ok) { didPatch = true; break; }
}

if (!didPatch) {
  // Запасной вариант: патчим через findByProps
  for (const name of SHEET_NAMES) {
    const mod = findByProps(name);
    if (!mod) continue;
    const ok = patchComp(mod, name, (args, res) =>
      args?.[0]?.userId ?? args?.[0]?.user?.id ?? res?.props?.userId
    );
    if (ok) { didPatch = true; break; }
  }
}

// ── Экспорт ───────────────────────────────────────────────────────────────────
export default {
  onLoad() {
    // Патчи уже наложены выше при загрузке модуля.
    // Если нужна отложенная инициализация — перенести сюда.
  },
  onUnload() {
    patches.forEach(p => { try { p(); } catch {} });
    patches.length = 0;
  },
};
