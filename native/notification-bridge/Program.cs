using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using Windows.UI.Notifications;
using Windows.UI.Notifications.Management;

internal static class Program
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    [STAThread]
    private static void Main()
    {
        Console.OutputEncoding = new UTF8Encoding(false);
        if (!HasPackageIdentity())
        {
            Write(new BridgeMessage("state", Status: "package-required"));
            return;
        }

        ApplicationConfiguration.Initialize();
        Application.Run(new PermissionWindow());
    }

    private static bool HasPackageIdentity()
    {
        uint length = 0;
        int result = GetCurrentPackageFullName(ref length, null);
        return result == ErrorInsufficientBuffer && length > 0;
    }

    private static void Write(BridgeMessage message)
    {
        Console.WriteLine(JsonSerializer.Serialize(message, JsonOptions));
        Console.Out.Flush();
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetCurrentPackageFullName(ref uint packageFullNameLength, StringBuilder? packageFullName);

    private const int ErrorInsufficientBuffer = 122;

    private sealed record BridgeMessage(string Type, string? Status = null, string? Source = null, string? Title = null, string? Body = null);

    private sealed class PermissionWindow : Form
    {
        private readonly Label _description;
        private readonly Button _allow;
        private readonly System.Windows.Forms.Timer _timer;
        private UserNotificationListener? _listener;
        private readonly HashSet<uint> _seenNotifications = [];
        private bool _scanInProgress;

        public PermissionWindow()
        {
            Text = "Notificações da Ilha";
            FormBorderStyle = FormBorderStyle.FixedDialog;
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(350, 132);
            MaximizeBox = false;
            MinimizeBox = false;
            ShowInTaskbar = true;
            TopMost = true;

            _description = new Label
            {
                AutoSize = false,
                Left = 16,
                Top = 14,
                Width = 318,
                Height = 60,
                Text = "A Ilha pode mostrar avisos novos do Opera (Gmail) e do WhatsApp. O Windows pedirá autorização antes de compartilhar o conteúdo das notificações."
            };
            _allow = new Button
            {
                Left = 204,
                Top = 87,
                Width = 130,
                Height = 29,
                Text = "Autorizar no Windows"
            };
            _allow.Click += OnAllowClicked;
            Controls.Add(_description);
            Controls.Add(_allow);

            _timer = new System.Windows.Forms.Timer { Interval = 900 };
            _timer.Tick += async (_, _) => await ScanAsync();
            Shown += async (_, _) => await CheckExistingPermissionAsync();
            FormClosing += (_, _) => Write(new BridgeMessage("state", Status: "stopped"));
        }

        private async Task CheckExistingPermissionAsync()
        {
            try
            {
                _listener = UserNotificationListener.Current;
                if (_listener.GetAccessStatus() == UserNotificationListenerAccessStatus.Allowed)
                {
                    await BeginListeningAsync();
                    return;
                }
                Write(new BridgeMessage("state", Status: "permission-required"));
            }
            catch (Exception error)
            {
                Write(new BridgeMessage("state", Status: "error", Body: error.Message));
                _description.Text = "O Windows não liberou o acesso às notificações. Confira a instalação MSIX da Ilha e tente novamente.";
            }
        }

        private async Task RequestPermissionAsync()
        {
            _allow.Enabled = false;
            _description.Text = "Aguardando a autorização do Windows…";
            try
            {
                _listener ??= UserNotificationListener.Current;
                var result = await _listener.RequestAccessAsync();
                if (result != UserNotificationListenerAccessStatus.Allowed)
                {
                    Write(new BridgeMessage("state", Status: "permission-denied"));
                    _description.Text = "A autorização não foi concedida. Você pode permitir o acesso nas configurações de notificações do Windows.";
                    _allow.Text = "Tentar novamente";
                    _allow.Enabled = true;
                    return;
                }
                await BeginListeningAsync();
            }
            catch (Exception error)
            {
                Write(new BridgeMessage("state", Status: "error", Body: error.Message));
                _description.Text = "Não consegui solicitar o acesso às notificações. Confira se a Ilha foi instalada pela versão MSIX.";
                _allow.Text = "Fechar";
                _allow.Enabled = true;
                _allow.Click -= OnAllowClicked;
                _allow.Click += (_, _) => Close();
            }
        }

        private async void OnAllowClicked(object? sender, EventArgs eventArgs) => await RequestPermissionAsync();

        private async Task BeginListeningAsync()
        {
            if (_listener is null) return;
            _allow.Enabled = false;
            _description.Text = "Permissão concedida. A Ilha está aguardando notificações do Opera e do WhatsApp.";
            try
            {
                var existing = await _listener.GetNotificationsAsync(NotificationKinds.Toast);
                foreach (var notification in existing) _seenNotifications.Add(notification.Id);
            }
            catch { }
            Write(new BridgeMessage("state", Status: "allowed"));
            Hide();
            _timer.Start();
        }

        private async Task ScanAsync()
        {
            if (_scanInProgress || _listener is null) return;
            _scanInProgress = true;
            try
            {
                var notifications = await _listener.GetNotificationsAsync(NotificationKinds.Toast);
                var currentIds = new HashSet<uint>();
                foreach (var notification in notifications)
                {
                    currentIds.Add(notification.Id);
                    if (!_seenNotifications.Add(notification.Id)) continue;
                    var source = notification.AppInfo?.DisplayInfo?.DisplayName ?? "Aplicativo";
                    if (!IsSupportedSource(source)) continue;
                    var (title, body) = ReadText(notification);
                    if (string.IsNullOrWhiteSpace(title) && string.IsNullOrWhiteSpace(body)) continue;
                    Write(new BridgeMessage("notification", Source: source, Title: Limit(title, 140), Body: Limit(body, 360)));
                }
                _seenNotifications.IntersectWith(currentIds);
            }
            catch (Exception error)
            {
                Write(new BridgeMessage("state", Status: "error", Body: error.Message));
                _timer.Stop();
            }
            finally
            {
                _scanInProgress = false;
            }
        }

        private static bool IsSupportedSource(string source)
        {
            var value = source.ToLowerInvariant();
            return value.Contains("whatsapp") || value.Contains("opera");
        }

        private static (string Title, string Body) ReadText(UserNotification notification)
        {
            var binding = notification.Notification?.Visual?.GetBinding(KnownNotificationBindings.ToastGeneric);
            var elements = binding?.GetTextElements();
            if (elements is null || elements.Count == 0) return ("", "");
            var title = elements[0]?.Text ?? "";
            var body = elements.Count > 1 ? string.Join(" ", elements.Skip(1).Select(element => element?.Text).Where(text => !string.IsNullOrWhiteSpace(text))) : "";
            return (title, body);
        }

        private static string Limit(string value, int maxLength) => value.Length <= maxLength ? value : value[..maxLength];
    }
}
