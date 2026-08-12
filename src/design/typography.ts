/**
 * Typography role references.
 * Runtime values live in src/design/tokens.css.
 */
export const typography = {
  display: { size: "--type-display-size", lineHeight: "--type-display-line", weight: "--type-display-weight" },
  pageTitle: { size: "--type-page-size", lineHeight: "--type-page-line", weight: "--type-page-weight" },
  sectionTitle: { size: "--type-section-size", lineHeight: "--type-section-line", weight: "--type-section-weight" },
  cardTitle: { size: "--type-card-size", lineHeight: "--type-card-line", weight: "--type-card-weight" },
  bodyLarge: { size: "--type-body-large-size", lineHeight: "--type-body-large-line", weight: "--type-body-large-weight" },
  body: { size: "--type-body-size", lineHeight: "--type-body-line", weight: "--type-body-weight" },
  bodyStrong: { size: "--type-body-strong-size", lineHeight: "--type-body-strong-line", weight: "--type-body-strong-weight" },
  small: { size: "--type-small-size", lineHeight: "--type-small-line", weight: "--type-small-weight" },
  caption: { size: "--type-caption-size", lineHeight: "--type-caption-line", weight: "--type-caption-weight" },
  button: { size: "--type-button-size", lineHeight: "--type-button-line", weight: "--type-button-weight" },
} as const;

export type TypographyToken = keyof typeof typography;
