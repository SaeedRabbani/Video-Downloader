/**
 * Centralized Application Branding Configuration
 * ----------------------------------------------
 * Update the values below and replace the files in `/public/` to customize
 * the application with your own brand name, header logo, and desktop `.exe` icon:
 *
 * 1. Top Header & About Page Logo:
 *    Replace `/public/logo.svg` (or put `/public/logo.png` and change `logoPath` below to `'./logo.png'`).
 *
 * 2. Windows Desktop `.exe` & Taskbar Icon:
 *    Replace `/public/icon.ico` and `/public/icon.png` (256x256 or 512x512 PNG / Windows ICO).
 */
export const APP_BRANDING = {
  /** Application title shown in the custom header bar and window title */
  appName: 'Universal Video Downloader',

  /** Full edition title shown on the About page */
  editionTitle: 'Universal Video Downloader — Windows Desktop Edition',

  /** Version string displayed in the UI */
  version: '1.0.0',

  /** Relative path to the logo inside `/public` (works in both web dev server and packaged Electron `.exe`) */
  logoPath: './logo.svg',

  /** Fallback PNG icon inside `/public` */
  iconPath: './icon.png',
} as const;
