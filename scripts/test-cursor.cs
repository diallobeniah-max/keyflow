using System;
using System.Runtime.InteropServices;

public class CursorSwitcher {
    [DllImport(user32.dll, SetLastError = true, CharSet = CharSet.Auto)]
    public static extern IntPtr LoadImage(IntPtr hinst, string lpszName, uint uType, int cxDesired, int cyDesired, uint fuLoad);

    [DllImport(user32.dll, SetLastError = true)]
    public static extern bool SetSystemCursor(IntPtr hcur, uint id);

    [DllImport(user32.dll, SetLastError = true)]
    public static extern bool SystemParametersInfo(uint uiAction, uint uiParam, IntPtr pvParam, uint fWinIni);

    public const uint IMAGE_CURSOR = 2;
    public const uint LR_LOADFROMFILE = 0x00000010;
    public const uint OCR_NORMAL = 32512;
    public const uint OCR_HAND = 32649;
    public const uint SPI_SETCURSORS = 0x0057;

    public static bool SetBlue(string curPath) {
        IntPtr h1 = LoadImage(IntPtr.Zero, curPath, IMAGE_CURSOR, 32, 32, LR_LOADFROMFILE);
        if (h1 == IntPtr.Zero) return false;
        return SetSystemCursor(h1, OCR_NORMAL);
    }

    public static bool Restore() {
        return SystemParametersInfo(SPI_SETCURSORS, 0, IntPtr.Zero, 0);
    }
}
