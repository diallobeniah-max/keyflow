$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -ReferencedAssemblies System.Windows.Forms,System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Linq;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

[StructLayout(LayoutKind.Sequential)] public struct PRect { public int left,top,right,bottom; }
[ComImport, Guid("8895b1c6-b41f-4c1c-a562-0d564250836f"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IPreviewHandler {
 [PreserveSig] int SetWindow(IntPtr hwnd,ref PRect rect);
 [PreserveSig] int SetRect(ref PRect rect);
 [PreserveSig] int DoPreview();
 [PreserveSig] int Unload();
 [PreserveSig] int SetFocus();
 [PreserveSig] int QueryFocus(out IntPtr hwnd);
 [PreserveSig] int TranslateAccelerator(IntPtr msg);
}
[ComImport, Guid("b824b49d-22ac-4161-ac8a-9916e8fa3f7f"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IInitializeWithStream { [PreserveSig] int Initialize(IStream stream,uint mode); }
[ComImport, Guid("b7d14566-0509-4cce-a71f-0a554233bd9b"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IInitializeWithFile { [PreserveSig] int Initialize([MarshalAs(UnmanagedType.LPWStr)] string file,uint mode); }
[ComImport, Guid("fc4801a3-2ba9-11cf-a229-00aa003d7352"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IObjectWithSite { [PreserveSig] int SetSite([MarshalAs(UnmanagedType.IUnknown)] object site); [PreserveSig] int GetSite(ref Guid iid,out IntPtr site); }
[StructLayout(LayoutKind.Sequential)] public struct FrameInfo { public IntPtr accelerator; public uint entries; }
[StructLayout(LayoutKind.Sequential)] public struct NativePoint { public int x,y; }
[StructLayout(LayoutKind.Sequential)] public struct NativeMessage { public IntPtr hwnd; public uint message; public IntPtr wParam,lParam; public uint time; public NativePoint point; public uint privateValue; }
[ComVisible(true),Guid("fec87aaf-35f9-447a-adb7-20234491401a"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IPreviewHandlerFrame { [PreserveSig] int GetWindowContext(out FrameInfo info); [PreserveSig] int TranslateAccelerator(ref NativeMessage message); }
[ComVisible(true),ClassInterface(ClassInterfaceType.None)]
class Frame : IPreviewHandlerFrame {
 [StructLayout(LayoutKind.Sequential)] struct GuiThreadInfo {public int size,flags;public IntPtr active,focus,capture,menu,move,caret;public int left,top,right,bottom;}
 [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
 [DllImport("user32.dll")] static extern bool GetGUIThreadInfo(uint thread,ref GuiThreadInfo info);
 readonly int key,modifiers; readonly bool escape;
 public Frame(int key,int modifiers,bool escape) {this.key=key;this.modifiers=modifiers;this.escape=escape;}
 internal static bool ShouldClose(int vk,int pressed,int key,int modifiers,bool escape,bool typing) {
  return (escape&&vk==0x1b&&pressed==0)||(!typing&&vk==key&&pressed==modifiers);
 }
 public int GetWindowContext(out FrameInfo info) { info=new FrameInfo();return 0; }
 public int TranslateAccelerator(ref NativeMessage message) {
  if(message.message!=0x100&&message.message!=0x104)return 1;
  int vk=unchecked((int)message.wParam.ToInt64());
  int pressed=((GetAsyncKeyState(0x11)&0x8000)!=0?1:0)|((GetAsyncKeyState(0x12)&0x8000)!=0?2:0)|((GetAsyncKeyState(0x10)&0x8000)!=0?4:0)|(((GetAsyncKeyState(0x5b)|GetAsyncKeyState(0x5c))&0x8000)!=0?8:0);
  var info=new GuiThreadInfo(); info.size=Marshal.SizeOf(typeof(GuiThreadInfo));
  bool typing=!GetGUIThreadInfo(0,ref info)||(info.flags&1)!=0;
  if(ShouldClose(vk,pressed,key,modifiers,escape,typing)) {Console.Out.WriteLine("CLOSE");return 0;}
  return 1;
 }
}

public sealed class OfficePreview : IDisposable {
 [DllImport("ole32.dll")] static extern int CoCreateInstance(ref Guid clsid,IntPtr outer,uint context,ref Guid iid,out IntPtr obj);
 [DllImport("shlwapi.dll",CharSet=CharSet.Unicode)] static extern int SHCreateStreamOnFileEx(string path,uint mode,uint attrs,bool create,IntPtr template,out IStream stream);
 [DllImport("user32.dll")] static extern IntPtr SetParent(IntPtr child,IntPtr parent);
 [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr hwnd,int index);
 [DllImport("user32.dll")] static extern int SetWindowLong(IntPtr hwnd,int index,int value);
 [DllImport("user32.dll")] static extern bool IsWindow(IntPtr hwnd);
 [DllImport("user32.dll")] static extern IntPtr GetParent(IntPtr hwnd);
 [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr value);
 readonly Form window;
 IntPtr ptr;
 object obj;
 IStream stream;
 IPreviewHandler handler;
 Frame site;
 readonly int key,modifiers; readonly bool escape;
 public OfficePreview(long parent,int x,int y,int width,int height,int key,int modifiers,bool escape) {
  if(!IsWindow(new IntPtr(parent))) throw new ArgumentException("Invalid parent window");
  this.key=key;this.modifiers=modifiers;this.escape=escape;
  try { SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch(EntryPointNotFoundException) { }
  window=new Form { FormBorderStyle=FormBorderStyle.None,ShowInTaskbar=false,StartPosition=FormStartPosition.Manual };
  var handle=window.Handle;
  int style=GetWindowLong(handle,-16); SetWindowLong(handle,-16,(style & ~unchecked((int)0x80000000)) | 0x40000000);
  SetParent(handle,new IntPtr(parent));
  if(GetParent(handle)!=new IntPtr(parent)) throw new InvalidOperationException("Unable to attach preview window");
  Resize(x,y,width,height);
 }
 public void Open(string path) {
  var ext=System.IO.Path.GetExtension(path);
  if(!new[]{".docx",".doc",".xlsx",".xls",".pptx",".ppt"}.Contains(ext,StringComparer.OrdinalIgnoreCase)) throw new ArgumentException("Unsupported document type");
  using(var key=Registry.ClassesRoot.OpenSubKey(ext+@"\shellex\{8895b1c6-b41f-4c1c-a562-0d564250836f}")) {
   var value=key==null?null:key.GetValue("") as string; Guid clsid;
   if(!Guid.TryParse(value,out clsid)) throw new InvalidOperationException("No registered preview handler");
   var iid=typeof(IPreviewHandler).GUID; int hr=CoCreateInstance(ref clsid,IntPtr.Zero,4,ref iid,out ptr);
   if(hr<0) Marshal.ThrowExceptionForHR(hr);
  }
  obj=Marshal.GetObjectForIUnknown(ptr); handler=(IPreviewHandler)obj;
  site=new Frame(this.key,modifiers,escape); var objectSite=obj as IObjectWithSite; if(objectSite!=null) objectSite.SetSite(site);
  int status; var initStream=obj as IInitializeWithStream;
  if(initStream!=null) { status=SHCreateStreamOnFileEx(path,0,0,false,IntPtr.Zero,out stream);if(status<0)Marshal.ThrowExceptionForHR(status);status=initStream.Initialize(stream,0); }
  else { var initFile=obj as IInitializeWithFile;if(initFile==null)throw new InvalidOperationException("No supported initializer");status=initFile.Initialize(path,0); }
  if(status<0)Marshal.ThrowExceptionForHR(status);
  var r=Rect();status=handler.SetWindow(window.Handle,ref r);if(status<0)Marshal.ThrowExceptionForHR(status);
  status=handler.DoPreview();if(status<0)Marshal.ThrowExceptionForHR(status);
  window.Show();Resize(window.Left,window.Top,window.Width,window.Height);
 }
 PRect Rect() { return new PRect{left=0,top=0,right=window.ClientSize.Width,bottom=window.ClientSize.Height}; }
 public void Resize(int x,int y,int width,int height) {
  if(width<1||height<1||width>16000||height>16000)throw new ArgumentException("Invalid bounds");
  window.SetBounds(x,y,width,height);if(handler!=null) {var r=Rect();handler.SetRect(ref r);}
 }
 public void Run() {
  var reader=new Thread(()=>{
   try {
    string line;
    while((line=Console.ReadLine())!=null) {
     if(line=="Q")break;
     if(line=="F") {window.BeginInvoke((Action)(()=>{if(handler!=null)handler.SetFocus();}));continue;}
     var parts=line.Split(' ');int x,y,w,h;
     if(parts.Length==5&&parts[0]=="R"&&int.TryParse(parts[1],out x)&&int.TryParse(parts[2],out y)&&int.TryParse(parts[3],out w)&&int.TryParse(parts[4],out h)) {
      int xx=x,yy=y,ww=w,hh=h;
      window.BeginInvoke((Action)(()=>{try{Resize(xx,yy,ww,hh);}catch{}}));
     }
    }
   } catch { }
   try{window.BeginInvoke((Action)(()=>window.Close()));}catch{}
  });
  reader.IsBackground=true;reader.Start();Application.Run(window);
 }
 public void Dispose() {
  if(handler!=null){handler.Unload();handler=null;}
  if(stream!=null){Marshal.ReleaseComObject(stream);stream=null;}
  if(obj!=null){var objectSite=obj as IObjectWithSite;if(objectSite!=null)objectSite.SetSite(null);Marshal.FinalReleaseComObject(obj);obj=null;}
  if(ptr!=IntPtr.Zero){Marshal.Release(ptr);ptr=IntPtr.Zero;}
  window.Dispose();
 }
}
'@
try {
  $line=[Console]::In.ReadLine()
  if (-not $line) { exit 2 }
  $request=$line | ConvertFrom-Json
  $hostWindow=New-Object OfficePreview ([long]$request.parent),([int]$request.x),([int]$request.y),([int]$request.width),([int]$request.height),([int]$request.key),([int]$request.modifiers),([bool]$request.escape)
  try {
    $hostWindow.Open([string]$request.path)
    [Console]::Out.WriteLine('READY')
    $hostWindow.Run()
  } finally { $hostWindow.Dispose() }
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  [Console]::Out.WriteLine('ERROR')
  exit 1
}
