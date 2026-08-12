/** Component size references. Runtime values live in src/design/tokens.css. */
export const componentSizes = {
  control: { sm: "--control-h-sm", md: "--control-h-md", lg: "--control-h-lg" },
  iconButton: { sm: "--icon-btn-sm", md: "--icon-btn-md", lg: "--icon-btn-lg" },
  select: {
    defaultHeight: "--select-h-default",
    largeHeight: "--select-h-large",
    paddingX: "--select-padding-x",
    arrowSize: "--select-arrow-size",
    arrowInset: "--select-arrow-inset",
    menuPadding: "--select-menu-padding",
    menuMaxHeight: "--select-menu-max-height",
    optionHeight: "--select-option-h",
  },
  sidebar: {
    width: "--layout-sidebar-width",
    collapsedWidth: "--layout-sidebar-collapsed-width",
    navHeight: "--layout-sidebar-nav-height",
    navRadius: "--layout-sidebar-nav-radius",
  },
  topbar: { height: "--layout-topbar-height" },
  titlebar: { height: "--layout-titlebar-height" },
  page: {
    paddingX: "--layout-page-padding-x",
    paddingY: "--layout-page-padding-y",
    maxReadable: "--layout-readable-width",
  },
  settings: {
    controlWidth: "--layout-settings-control-width",
    rowMinHeight: "--settings-row-min-height",
    rowPaddingX: "--settings-row-padding-x",
    rowPaddingY: "--settings-row-padding-y",
  },
  card: { padding: "--card-padding", paddingDense: "--card-padding-dense", radius: "--card-radius" },
  input: { height: "--control-h-md", heightLarge: "--control-h-lg", paddingX: "--control-padding-x", radius: "--control-radius" },
  keyboardKey: { height: "--key-height", minWidth: "--key-min-width", gap: "--key-gap", radius: "--key-radius", badgeSize: "--key-badge-size" },
  popup: { width: "--popup-width", itemHeight: "--popup-item-height", radius: "--popup-radius" },
} as const;

export type ComponentSizeCategory = keyof typeof componentSizes;
