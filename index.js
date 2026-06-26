(function () {
    "use strict";

    const { React, ReactNative } = vendetta.metro.common;
    const metro = vendetta.metro;
    const { findByProps, findByName } = metro;
    const patcher = vendetta.patcher;
    const { after, before } = patcher;
    const { showToast } = vendetta.ui.toasts;
    const { Forms } = vendetta.ui.components;

    const storage = vendetta.plugin.storage;

    if (typeof storage.enabled === "undefined") storage.enabled = true;
    if (typeof storage.showFakeToast === "undefined") storage.showFakeToast = true;

    let patches = [];

    // Проверка реальных прав
    function hasModPermissions(guildId) {
        try {
            const MemberStore = findByProps("getSelfMember");
            const Perms = findByProps("Permissions");
            if (!MemberStore || !Perms || !guildId) return false;

            const member = MemberStore.getSelfMember(guildId);
            if (!member?.permissions) return false;

            const perms = BigInt(member.permissions);
            return !!(perms & BigInt(Perms.MANAGE_MESSAGES)) ||
                   !!(perms & BigInt(Perms.KICK_MEMBERS)) ||
                   !!(perms & BigInt(Perms.BAN_MEMBERS)) ||
                   !!(perms & BigInt(Perms.MODERATE_MEMBERS));
        } catch (e) {
            return false;
        }
    }

    function getCurrentGuildId() {
        return findByProps("getGuildId")?.getGuildId?.() || null;
    }

    // Основной патч — заставляем показывать секцию модератора
    function patchModeratorSection() {
        try {
            // Ищем компонент профиля пользователя
            const UserProfile = findByName("UserProfile", false) ||
                               findByProps("UserProfile")?.default ||
                               findByProps("renderModeratorActions");

            if (!UserProfile) {
                console.warn("[FakeMod] UserProfile not found");
                return false;
            }

            patches.push(after("default", UserProfile, (args, ret) => {
                try {
                    const guildId = args[0]?.guildId || getCurrentGuildId();
                    const isRealMod = hasModPermissions(guildId);

                    // Ищем внутри рендера секцию с модераторскими действиями
                    // Discord обычно использует что-то вроде ModeratorActions или similar
                    const children = ret?.props?.children || ret;
                    if (!children) return ret;

                    // Рекурсивно ищем и форсируем показ
                    const forceShowModActions = (node) => {
                        if (!node || typeof node !== "object") return;

                        if (node.props?.label === "Действия модератора" || 
                            node.props?.children?.some?.(c => c?.props?.label === "Тайм-аут")) {
                            if (node.props) {
                                node.props.hidden = false;
                                node.props.style = { ...node.props.style, opacity: isRealMod ? 1 : 0.85 };
                            }
                        }

                        if (Array.isArray(node.props?.children)) {
                            node.props.children.forEach(forceShowModActions);
                        } else if (node.props?.children) {
                            forceShowModActions(node.props.children);
                        }
                    };

                    forceShowModActions(children);

                    // Если секции нет — можно попробовать добавить, но лучше патчить permission check
                } catch (e) {
                    console.error("[FakeMod] profile patch error:", e);
                }
                return ret;
            }));

            return true;
        } catch (e) {
            console.error("[FakeMod] patchModeratorSection error:", e);
            return false;
        }
    }

    // Патч на проверку прав (самое важное)
    function patchPermissionChecks() {
        try {
            // Многие проверки прав идут через canManageUser или similar
            const PermissionUtils = findByProps("can", "canManageUser", "canKick") || 
                                   findByProps("canModerate");

            if (PermissionUtils) {
                patches.push(before("can", PermissionUtils, (args) => {
                    const [action, guildId] = args;
                    if (["kick", "ban", "timeout", "moderate"].some(a => action?.toLowerCase().includes(a))) {
                        // Разрешаем показ кнопок
                        return [action, guildId]; // продолжаем, но ниже можем перехватить действие
                    }
                }));

                patches.push(after("can", PermissionUtils, (args, res) => {
                    const action = args[0];
                    if (["kick", "ban", "timeout", "moderate", "MANAGE"].some(a => String(action).includes(a))) {
                        return true; // форсируем true для UI
                    }
                    return res;
                }));
            }

            return true;
        } catch (e) {
            console.error("[FakeMod] permission patch error:", e);
            return false;
        }
    }

    function handleFakeAction(type) {
        if (storage.showFakeToast) {
            showToast(`❌ У тебя нет прав на ${type}. Это только визуал.`, { variant: "error" });
        }
    }

    function Settings() {
        const [enabled, setEnabled] = React.useState(storage.enabled);
        const [toast, setToast] = React.useState(storage.showFakeToast);

        const save = () => {
            storage.enabled = enabled;
            storage.showFakeToast = toast;
            showToast("✅ Настройки сохранены");
        };

        return React.createElement(ReactNative.ScrollView, null,
            React.createElement(Forms.FormSection, { title: "Fake Moderator" },
                React.createElement(Forms.FormSwitch, {
                    label: "Включить плагин",
                    value: enabled,
                    onValueChange: setEnabled
                }),
                React.createElement(Forms.FormSwitch, {
                    label: "Показывать уведомление при нажатии",
                    value: toast,
                    onValueChange: setToast
                })
            ),
            React.createElement(Forms.FormRow, { label: "Сохранить изменения", onPress: save })
        );
    }

    function onLoad() {
        if (!storage.enabled) return;

        const p1 = patchModeratorSection();
        const p2 = patchPermissionChecks();

        if (p1 || p2) {
            showToast("✅ FakeModButtons загружен\nОригинальные кнопки модератора включены");
        } else {
            showToast("⚠️ Не удалось найти нужные компоненты");
        }
    }

    function onUnload() {
        patches.forEach(p => { try { p(); } catch {} });
        patches = [];
    }

    return { onLoad, onUnload, settings: Settings };
})();
