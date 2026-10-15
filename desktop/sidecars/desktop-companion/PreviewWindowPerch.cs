using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows;
using Point = System.Windows.Point;

namespace TryloDesktopPet;

/// <summary>Opt-in docking: drag the pet's feet to the observer's top edge.</summary>
internal sealed class PreviewWindowPerch
{
    private const string PreviewTitle = "Trylo · 电脑控制";
    private IntPtr _window;
    private double _fraction;
    public bool IsDocked => _window != IntPtr.Zero;
    private delegate bool WindowVisitor(IntPtr handle, IntPtr parameter);
    [StructLayout(LayoutKind.Sequential)]
    private struct NativeRect { public int Left, Top, Right, Bottom; }
    [DllImport("user32.dll")]
    private static extern bool EnumWindows(WindowVisitor visitor, IntPtr parameter);
    [DllImport("user32.dll")]
    private static extern bool GetWindowRect(IntPtr window, out NativeRect rect);
    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")]
    private static extern bool IsIconic(IntPtr window);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr window, StringBuilder title, int length);
    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);

    private static Rect? Bounds(Window pet, IntPtr window)
    {
        if (!IsWindowVisible(window) || IsIconic(window) || !GetWindowRect(window, out var rect)) return null;
        var source = PresentationSource.FromVisual(pet);
        if (source?.CompositionTarget is null) return null;
        var transform = source.CompositionTarget.TransformFromDevice;
        var topLeft = transform.Transform(new Point(rect.Left, rect.Top));
        var bottomRight = transform.Transform(new Point(rect.Right, rect.Bottom));
        return new Rect(topLeft, bottomRight);
    }

    public void Detach() => _window = IntPtr.Zero;
    public bool TryDock(Window pet)
    {
        Detach();
        var center = pet.Left + pet.ActualWidth / 2;
        // PetSprite ends six DIP above the transparent window's bottom.
        var feet = pet.Top + pet.ActualHeight - 6;
        EnumWindows((window, _) =>
        {
            var title = new StringBuilder(128);
            GetWindowText(window, title, title.Capacity);
            if (title.ToString() != PreviewTitle) return true;
            GetWindowThreadProcessId(window, out var pid);
            try
            {
                using var process = Process.GetProcessById((int)pid);
                if (!process.ProcessName.Equals("trylo-desktop", StringComparison.OrdinalIgnoreCase) &&
                    !process.ProcessName.Equals("Trylo", StringComparison.OrdinalIgnoreCase)) return true;
            }
            catch { return true; }
            var bounds = Bounds(pet, window);
            if (bounds is not Rect edge || center < edge.Left || center > edge.Right || Math.Abs(feet - edge.Top) > 48) return true;
            _window = window;
            _fraction = Math.Clamp((center - edge.Left) / edge.Width, 0, 1);
            return false;
        }, IntPtr.Zero);
        return Follow(pet);
    }

    public bool Follow(Window pet)
    {
        if (_window == IntPtr.Zero) return false;
        if (Bounds(pet, _window) is not Rect edge) { Detach(); return false; }
        pet.Left = edge.Left + edge.Width * _fraction - pet.ActualWidth / 2;
        pet.Top = edge.Top - pet.ActualHeight + 6;
        return true;
    }
}
