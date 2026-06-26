(function () {
    "use strict";

    const { React, ReactNative: RN } = vendetta.metro.common;
    const { findByProps, findByName } = vendetta.metro;
    const patcher = vendetta.patcher;
    const { after } = patcher;
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

    // Модальные окна для действий (timeout, kick, ban)
    function showModActionModal(type, user, guildId) {
        const isReal = hasRealPermissions(guildId);
        if (!isReal) {
            if (storage.showFakeToast) showToast(`❌ Нет прав на ${type}. Это только визуал.`, { variant: "error" });
            return;
        }

        // Здесь можно добавить реальные вызовы (пока заглушка)
        showToast(`✅ Выполняется: ${type} для ${user.username}`);
        // TODO: Реализовать timeout/kick/ban через Discord модули при необходимости
    }

    // Компонент фейковой секции модератора
    const FakeModeratorSection = ({ user, guildId }) => {
        const isRealMod = hasRealPermissions(guildId);

        const actions = [
            { label: "Тайм-аут", icon: "⏰", color: "#f0b232", onPress: () => showModActionModal("тайм-аут", user, guildId) },
            { label: "Выгнать", icon: "🚪", color: "#f04747", onPress: () => showModActionModal("кик", user, guildId) },
            { label: "Забанить", icon: "🔨", color: "#f04747", onPress: () => showModActionModal("бан", user, guildId) },
        ];

        return React.createElement(Forms.FormSection, { title: "Действия модератора" },
            actions.map((act, i) => 
                React.createElement(Forms.FormRow, {
                    key: i,
                    label: act.label,
                    leading: React.createElement(RN.Text, { style: { fontSize: 20, color: act.color } }, act.icon),
                    trailing: React.createElement(RN.Text, { style: { color: isRealMod ? "#43b581" : "#b5bac1" } }, isRealMod ? "✓" : "👁️"),
                    onPress: act.onPress,
                    style: { opacity: isRealMod ? 1 : 0.75 }
                })
            )
        );
    };

    // Патч профиля пользователя — добавляем свою секцию
    function patchUserProfile() {
        const UserProfile = findByName("UserProfile") || findByProps("UserProfile")?.default;

        if (!UserProfile) {
            console.warn("[FakeMod] UserProfile component not found");
            return false;
        }

        patches.push(after("default", UserProfile, (args, ret) => {
            try {
                const props = args[0] || {};
                const guildId = props.guildId || getGuildId();
                const user = props.user;

                if (!user || !guildId) return ret;

                const children = ret?.props?.children || ret;

                if (Array.isArray(children)) {
                    // Добавляем в конец
                    children.push(React.createElement(FakeModeratorSection, { user, guildId }));
                } else if (children?.props?.children) {
                    const ch = children.props.children;
                    if (Array.isArray(ch)) ch.push(React.createElement(FakeModeratorSection, { user, guildId }));
                }
            } catch (e) {
                console.error("[FakeMod] patch error:", e);
            }
            return ret;
        }));

        return true;
    }

    function Settings() {
        const [enabled, setEnabled] = React.useState(storage.enabled);
        const [toast, setToast] = React.useState(storage.showFakeToast);

        const save = () => {
            storage.enabled = enabled;
            storage.showFakeToast = toast;
            showToast("✅ Настройки сохранены");
        };

        return React.createElement(RN.ScrollView, null,
            React.createElement(Forms.FormSection, { title: "Fake Moderator Buttons" },
                React.createElement(Forms.FormSwitch, { label: "Включён", value: enabled, onValueChange: setEnabled }),
                React.createElement(Forms.FormSwitch, { label: "Показывать уведомления", value: toast, onValueChange: setToast })
            ),
            React.createElement(Forms.FormRow, { label: "💾 Сохранить", onPress: save })
        );
    }

    function onLoad() {
        if (!storage.enabled) return;

        if (patchUserProfile()) {
            showToast("✅ FakeModButtons загружен\nОткрой профиль любого пользователя");
        } else {
            showToast("⚠️ Не удалось найти профиль. Перезагрузи Discord");
        }
    }

    function onUnload() {
        patches.forEach(p => { try { p(); } catch (e) {} });
        patches = [];
    }

    return { onLoad, onUnload, settings: Settings };
})();
