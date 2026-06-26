(function () {
    "use strict";

    const { React, ReactNative: RN } = vendetta.metro.common;
    const { findByProps, findByName } = vendetta.metro;
    const patcher = vendetta.patcher;
    const { after, instead } = patcher;
    const { showToast } = vendetta.ui.toasts;
    const { Forms } = vendetta.ui.components;

    const storage = vendetta.plugin.storage;

    if (typeof storage.enabled === "undefined") storage.enabled = true;
    if (typeof storage.showFakeToast === "undefined") storage.showFakeToast = true;

    let patches = [];

    function hasRealPermissions(guildId) {
        try {
            const MemberStore = findByProps("getSelfMember");
            const Perms = findByProps("Permissions");
            if (!MemberStore || !Perms || !guildId) return false;

            const member = MemberStore.getSelfMember(guildId);
            if (!member?.permissions) return false;

            const p = BigInt(member.permissions);
            return !!(p & BigInt(Perms.MODERATE_MEMBERS)) ||
                   !!(p & BigInt(Perms.KICK_MEMBERS)) ||
                   !!(p & BigInt(Perms.BAN_MEMBERS)) ||
                   !!(p & BigInt(Perms.MANAGE_MESSAGES));
        } catch (e) { return false; }
    }

    function getGuildId() {
        return findByProps("getGuildId")?.getGuildId?.() || null;
    }

    // Патч проверки прав — чтобы Discord думал, что у тебя есть права
    function patchPermissionChecks() {
        const PermUtils = findByProps("canManageUser", "canKick", "canBan", "canTimeout") || 
                         findByProps("getGuildPermissions");

        if (PermUtils) {
            // canManageUser и подобные
            if (PermUtils.canManageUser) {
                patches.push(instead("canManageUser", PermUtils, () => true));
            }
            if (PermUtils.canKick) {
                patches.push(instead("canKick", PermUtils, () => true));
            }
            if (PermUtils.canBan) {
                patches.push(instead("canBan", PermUtils, () => true));
            }
            console.log("[FakeMod] Пропатчены проверки прав");
        }
    }

    // Добавляем/форсируем действия в профиль
    function patchUserProfileSheet() {
        const UserProfileSheet = findByName("UserProfileSheet") || 
                                findByProps("UserProfileSheet")?.default ||
                                findByProps("useUserProfileSheetActions");

        if (!UserProfileSheet) return false;

        patches.push(after("default", UserProfileSheet, (args, ret) => {
            try {
                const guildId = args[0]?.guildId || getGuildId();
                const isReal = hasRealPermissions(guildId);

                // Если есть actions — добавляем модераторские
                let actions = ret?.props?.children || [];
                if (!Array.isArray(actions)) actions = [actions];

                const modActions = [
                    { label: "Тайм-аут", color: "#faa61a", action: () => handleModAction("Тайм-аут", guildId) },
                    { label: "Выгнать", color: "#f04747", action: () => handleModAction("Выгнать", guildId) },
                    { label: "Забанить", color: "#f04747", action: () => handleModAction("Забанить", guildId) },
                ];

                modActions.forEach(act => {
                    actions.push(
                        React.createElement(Forms.FormRow, {
                            label: act.label,
                            leading: React.createElement(RN.Text, {style: {fontSize: 24, color: act.color}}, "⚒️"),
                            onPress: act.action,
                            style: { opacity: isReal ? 1 : 0.75 }
                        })
                    );
                });

                if (ret?.props) ret.props.children = actions;
            } catch (e) {
                console.error("[FakeMod] sheet patch error:", e);
            }
            return ret;
        }));

        return true;
    }

    function handleModAction(type, guildId) {
        const isReal = hasRealPermissions(guildId);
        if (!isReal) {
            if (storage.showFakeToast) showToast(`❌ Нет прав на ${type}. Это только визуал.`, { variant: "error" });
            return;
        }
        showToast(`✅ ${type} выполнен`);
    }

    function Settings() {
        const [enabled, setEnabled] = React.useState(storage.enabled);
        const [toast, setToast] = React.useState(storage.showFakeToast);

        const save = () => {
            storage.enabled = enabled;
            storage.showFakeToast = toast;
            showToast("✅ Сохранено");
        };

        return React.createElement(RN.ScrollView, null,
            React.createElement(Forms.FormSection, { title: "Fake Moderator" },
                React.createElement(Forms.FormSwitch, { label: "Включить", value: enabled, onValueChange: setEnabled }),
                React.createElement(Forms.FormSwitch, { label: "Показывать тосты", value: toast, onValueChange: setToast })
            ),
            React.createElement(Forms.FormRow, { label: "💾 Сохранить", onPress: save })
        );
    }

    function onLoad() {
        if (!storage.enabled) return;

        patchPermissionChecks();
        const sheetPatched = patchUserProfileSheet();

        if (sheetPatched) {
            showToast("✅ FakeModButtons загружен\nОткрой профиль пользователя");
        } else {
            showToast("✅ Плагин загружен (патч прав активен)");
        }
    }

    function onUnload() {
        patches.forEach(p => { try { p(); } catch {} });
        patches = [];
    }

    return { onLoad, onUnload, settings: Settings };
})();
