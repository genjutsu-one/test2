(function () {
    "use strict";

    const { React, ReactNative: RN } = vendetta.metro.common;
    const { findByProps, findByName } = vendetta.metro;
    const patcher = vendetta.patcher;
    const { after, before } = patcher;
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

    // === Патч 1: Принудительно показываем секцию модератора ===
    function patchUserProfile() {
        const UserProfileComponent = findByName("UserProfile") || 
                                     findByProps("UserProfile")?.default;

        if (!UserProfileComponent) return false;

        patches.push(after("default", UserProfileComponent, (args, ret) => {
            try {
                const guildId = args[0]?.guildId || getGuildId();
                const isRealMod = hasRealPermissions(guildId);

                const forceModSection = (node) => {
                    if (!node || typeof node !== "object") return node;

                    // Ищем заголовок "Действия модератора"
                    if (node.props?.label === "Действия модератора" || 
                        (Array.isArray(node.props?.children) && 
                         node.props.children.some(c => c?.props?.label === "Тайм-аут"))) {
                        
                        if (node.props) {
                            node.props.hidden = false;
                            if (node.props.style) node.props.style.opacity = isRealMod ? 1 : 0.9;
                        }
                    }

                    if (Array.isArray(node.props?.children)) {
                        node.props.children = node.props.children.map(forceModSection);
                    } else if (node.props?.children) {
                        node.props.children = forceModSection(node.props.children);
                    }
                    return node;
                };

                return forceModSection(ret);
            } catch (e) {
                console.error("[FakeMod] profile error:", e);
            }
            return ret;
        }));
        return true;
    }

    // === Патч 2: Обходим проверки прав ===
    function patchPermissions() {
        const canFunc = findByProps("can", "canManageUser", "canKick", "canBan") || 
                       findByProps("canModerate");

        if (!canFunc) return false;

        // before — разрешаем вызов
        patches.push(before("can", canFunc, (args) => {
            const perm = args[0];
            if (typeof perm === "string" && /kick|ban|timeout|moderate|manage/i.test(perm)) {
                return args; // пропускаем дальше
            }
        }));

        // after — возвращаем true для UI
        patches.push(after("can", canFunc, (args, result) => {
            const perm = args[0];
            if (typeof perm === "string" && /kick|ban|timeout|moderate|manage/i.test(perm)) {
                return true;
            }
            return result;
        }));

        return true;
    }

    // === Перехват реальных действий (чтобы не падало) ===
    function patchActions() {
        // Можно добавить позже, если нужно
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
                React.createElement(Forms.FormSwitch, { label: "Показывать тост при нажатии", value: toast, onValueChange: setToast })
            ),
            React.createElement(Forms.FormRow, { label: "💾 Сохранить", onPress: save })
        );
    }

    function onLoad() {
        if (!storage.enabled) return;

        const p1 = patchUserProfile();
        const p2 = patchPermissions();

        if (p1 || p2) {
            showToast("✅ FakeModButtons загружен\nПопробуй открыть профиль пользователя");
        } else {
            showToast("⚠️ Не все компоненты найдены. Возможно нужна перезагрузка Discord");
        }
    }

    function onUnload() {
        patches.forEach(p => { try { p(); } catch (e) {} });
        patches = [];
    }

    return { onLoad, onUnload, settings: Settings };
})();
