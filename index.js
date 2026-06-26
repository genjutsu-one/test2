(function () {
  "use strict";

  const vd = window.vendetta ?? {};
  const findByProps  = vd.metro?.findByProps  ?? (() => null);
  const findByName   = vd.metro?.findByName   ?? (() => null);
  const after        = vd.patcher?.after       ?? (() => () => {});
  const showToast    = vd.ui?.toasts?.showToast ?? (() => {});
  const { React }    = vd.metro?.common ?? { React: window.React };

  // ── Discord internals ──────────────────────────────────────────────────────
  const PermissionStore = findByProps("can", "canManageUser");
  const RestAPI         = findByProps("del", "get", "patch", "post", "put");
  const UserStore       = findByProps("getCurrentUser");
  const {
    View, Text, TouchableOpacity, StyleSheet,
    Modal, TextInput, Pressable,
  } = findByProps("StyleSheet") ?? {};

  const UserContextMenuItems = findByName("UserContextMenuItems", false);
  const MenuItem = findByName("MenuItem", false)
    ?? findByProps("MenuItem")?.MenuItem;

  const P = findByProps("ADMINISTRATOR", "BAN_MEMBERS") ?? {
    BAN_MEMBERS:  4n,
    KICK_MEMBERS: 2n,
    MUTE_MEMBERS: 4194304n,
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  function hasPerm(guildId, flag) {
    try { return PermissionStore?.can(flag, { guildId }) ?? false; }
    catch { return false; }
  }

  function isMod(guildId) {
    return hasPerm(guildId, P.BAN_MEMBERS)
      || hasPerm(guildId, P.KICK_MEMBERS)
      || hasPerm(guildId, P.MUTE_MEMBERS);
  }

  const api = {
    ban:    (g, u) => RestAPI.put({ url: `/guilds/${g}/bans/${u}`, body: { delete_message_days: 1 } }),
    kick:   (g, u) => RestAPI.del({ url: `/guilds/${g}/members/${u}` }),
    mute:   (g, u, mins) => RestAPI.patch({
      url: `/guilds/${g}/members/${u}`,
      body: { communication_disabled_until: mins > 0
        ? new Date(Date.now() + mins * 60000).toISOString()
        : null },
    }),
  };

  // ── Palette ────────────────────────────────────────────────────────────────
  const C = {
    bg: "#0f0f14", surface: "#16161f", border: "#2a2a3d",
    dim: "#7c3aed", danger: "#f43f5e", warn: "#fb923c",
    info: "#38bdf8", ok: "#4ade80", text: "#e2e8f0", sub: "#94a3b8",
  };

  const S = StyleSheet?.create({
    overlay:  { flex: 1, backgroundColor: "rgba(0,0,0,0.72)", justifyContent: "flex-end" },
    sheet:    { backgroundColor: C.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 38, borderTopWidth: 1, borderColor: C.border },
    header:   { flexDirection: "row", alignItems: "center", marginBottom: 18 },
    badge:    { backgroundColor: C.dim, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 3, marginRight: 10 },
    badgeTxt: { color: "#fff", fontSize: 11, fontWeight: "700", letterSpacing: 1.2 },
    title:    { color: C.text, fontSize: 16, fontWeight: "700", flex: 1 },
    closeBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.surface, alignItems: "center", justifyContent: "center" },
    closeTxt: { color: C.sub, fontSize: 16 },
    grid:     { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 },
    btn:      { flex: 1, minWidth: "45%", borderRadius: 14, paddingVertical: 13, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1 },
    btnOff:   { opacity: 0.32 },
    emoji:    { fontSize: 18 },
    btnLbl:   { color: "#fff", fontSize: 14, fontWeight: "600" },
    btnSub:   { color: "rgba(255,255,255,0.5)", fontSize: 11, marginTop: 2 },
    label:    { color: C.sub, fontSize: 11, fontWeight: "700", letterSpacing: 0.9, marginBottom: 7 },
    input:    { backgroundColor: C.surface, borderRadius: 10, borderWidth: 1, borderColor: C.border, color: C.text, fontSize: 14, paddingHorizontal: 14, paddingVertical: 10 },
    confirmRow: { flexDirection: "row", gap: 10, marginTop: 14 },
    confirmBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: "center" },
    confirmTxt: { color: "#fff", fontWeight: "700", fontSize: 15 },
    cancelTxt:  { color: C.sub, fontWeight: "600", fontSize: 15 },
    noBox:    { backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 18, marginTop: 6, alignItems: "center" },
    noEmoji:  { fontSize: 30, marginBottom: 8 },
    noTitle:  { color: C.text, fontWeight: "700", fontSize: 15 },
    noSub:    { color: C.sub, fontSize: 12, marginTop: 4, textAlign: "center" },
  }) ?? {};

  // ── Actions ────────────────────────────────────────────────────────────────
  const ACTIONS = [
    { id: "ban",    label: "Ban",      sub: "Permanent",       emoji: "🔨", bg: "#2d1219", border: C.danger, perm: P.BAN_MEMBERS,  confirm: true, exec: (g,u) => api.ban(g,u) },
    { id: "kick",   label: "Kick",     sub: "Remove",          emoji: "👢", bg: "#2d1a0a", border: C.warn,   perm: P.KICK_MEMBERS, confirm: true, exec: (g,u) => api.kick(g,u) },
    { id: "m10",    label: "Mute 10m", sub: "Timeout",         emoji: "🔇", bg: "#0a1e2d", border: C.info,   perm: P.MUTE_MEMBERS, exec: (g,u) => api.mute(g,u,10) },
    { id: "m60",    label: "Mute 1h",  sub: "Timeout",         emoji: "⏱️", bg: "#0a1e2d", border: C.info,   perm: P.MUTE_MEMBERS, exec: (g,u) => api.mute(g,u,60) },
    { id: "m24h",   label: "Mute 24h", sub: "Timeout",         emoji: "🌙", bg: "#0a1e2d", border: C.info,   perm: P.MUTE_MEMBERS, exec: (g,u) => api.mute(g,u,1440) },
    { id: "unmute", label: "Unmute",   sub: "Remove timeout",  emoji: "✅", bg: "#0a2d1a", border: C.ok,     perm: P.MUTE_MEMBERS, exec: (g,u) => api.mute(g,u,0) },
  ];

  // ── Modal component ────────────────────────────────────────────────────────
  function ModModal({ visible, onClose, userId, guildId, username }) {
    const [reason, setReason]   = React.useState("");
    const [busy, setBusy]       = React.useState(null);
    const [confirm, setConfirm] = React.useState(null);
    const modHere = isMod(guildId);

    async function run(action) {
      setBusy(action.id);
      try {
        await action.exec(guildId, userId);
        showToast(`${action.emoji} ${action.label} → ${username}`);
        setReason(""); setConfirm(null); onClose();
      } catch (e) {
        showToast(`❌ Failed: ${e?.message ?? "unknown"}`);
      } finally { setBusy(null); }
    }

    function press(a) {
      if (!hasPerm(guildId, a.perm)) {
        showToast("❌ No permission for this action here");
        return;
      }
      if (a.confirm) { setConfirm(a); return; }
      run(a);
    }

    return React.createElement(Modal, { visible, transparent: true, animationType: "slide", onRequestClose: onClose },
      React.createElement(Pressable, { style: S.overlay, onPress: onClose },
        React.createElement(Pressable, { style: S.sheet, onPress: () => {} },

          // Header
          React.createElement(View, { style: S.header },
            React.createElement(View, { style: S.badge },
              React.createElement(Text, { style: S.badgeTxt }, "MOD")),
            React.createElement(Text, { style: S.title, numberOfLines: 1 }, username),
            React.createElement(TouchableOpacity, { style: S.closeBtn, onPress: onClose },
              React.createElement(Text, { style: S.closeTxt }, "✕"))),

          // No perms
          !modHere
            ? React.createElement(View, { style: S.noBox },
                React.createElement(Text, { style: S.noEmoji }, "🚫"),
                React.createElement(Text, { style: S.noTitle }, "No moderator permissions"),
                React.createElement(Text, { style: S.noSub }, "You can't Ban, Kick or Mute on this server."))

          // Confirm screen
          : confirm
            ? React.createElement(React.Fragment, null,
                React.createElement(Text, { style: [S.label, { marginBottom: 10 }] },
                  `${confirm.emoji} Confirm ${confirm.label} for ${username}`),
                React.createElement(TextInput, {
                  style: S.input, placeholder: "Reason (optional)...",
                  placeholderTextColor: C.sub, value: reason,
                  onChangeText: setReason, maxLength: 200,
                }),
                React.createElement(View, { style: S.confirmRow },
                  React.createElement(TouchableOpacity,
                    { style: [S.confirmBtn, { backgroundColor: C.surface }], onPress: () => setConfirm(null) },
                    React.createElement(Text, { style: S.cancelTxt }, "Cancel")),
                  React.createElement(TouchableOpacity,
                    { style: [S.confirmBtn, { backgroundColor: confirm.border }],
                      onPress: () => run(confirm), disabled: !!busy },
                    React.createElement(Text, { style: S.confirmTxt },
                      busy ? "Working..." : `${confirm.emoji} Confirm`))))

          // Grid
          : React.createElement(React.Fragment, null,
              React.createElement(View, { style: S.grid },
                ACTIONS.map(a => {
                  const ok = hasPerm(guildId, a.perm);
                  return React.createElement(TouchableOpacity, {
                    key: a.id,
                    style: [S.btn, { backgroundColor: a.bg, borderColor: a.border }, !ok && S.btnOff],
                    onPress: () => press(a), disabled: busy === a.id, activeOpacity: 0.7,
                  },
                    React.createElement(Text, { style: S.emoji }, busy === a.id ? "⏳" : a.emoji),
                    React.createElement(View, null,
                      React.createElement(Text, { style: S.btnLbl }, a.label),
                      React.createElement(Text, { style: S.btnSub }, ok ? a.sub : "No permission")));
                })),
              React.createElement(Text, { style: S.label }, "REASON"),
              React.createElement(TextInput, {
                style: S.input, placeholder: "Optional, for mutes...",
                placeholderTextColor: C.sub, value: reason,
                onChangeText: setReason, maxLength: 200,
              }))
        )
      )
    );
  }

  // ── Context menu entry ─────────────────────────────────────────────────────
  function ModEntry({ userId, guildId, username }) {
    const [open, setOpen] = React.useState(false);
    if (!MenuItem) return null;
    return React.createElement(React.Fragment, null,
      React.createElement(MenuItem, {
        key: "modpanel", id: "modpanel",
        label: "🛡️ Mod Panel",
        action: () => setOpen(true),
      }),
      React.createElement(ModModal, {
        visible: open, onClose: () => setOpen(false),
        userId, guildId, username,
      })
    );
  }

  // ── Plugin lifecycle ───────────────────────────────────────────────────────
  let unpatch = null;

  module.exports = {
    onLoad() {
      if (!UserContextMenuItems) {
        console.warn("[ModPanel] UserContextMenuItems not found");
        return;
      }
      unpatch = after("default", UserContextMenuItems, (args, res) => {
        const [{ user, guildId }] = args;
        if (!guildId || !user) return res;
        const me = UserStore?.getCurrentUser?.();
        if (me?.id === user.id) return res;

        const entry = React.createElement(ModEntry, {
          userId: user.id,
          guildId,
          username: user.username ?? user.id,
        });

        if (Array.isArray(res)) {
          res.push(entry);
        } else if (res?.props?.children) {
          const ch = res.props.children;
          if (Array.isArray(ch)) ch.push(entry);
        }
        return res;
      });
    },

    onUnload() {
      unpatch?.();
      unpatch = null;
    },
  };
})();
