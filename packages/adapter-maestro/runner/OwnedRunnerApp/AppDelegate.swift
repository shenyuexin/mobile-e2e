import UIKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    window = UIWindow(frame: UIScreen.main.bounds)
    window?.rootViewController = RunnerRootViewController()
    window?.makeKeyAndVisible()
    return true
  }
}

final class RunnerRootViewController: UIViewController {
  private let titleLabel = UILabel()
  private let textField = UITextField()
  private let tapButton = UIButton(type: .system)
  private let statusLabel = UILabel()

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .systemBackground

    titleLabel.translatesAutoresizingMaskIntoConstraints = false
    titleLabel.text = "Owned iOS Runner"
    titleLabel.accessibilityIdentifier = "owned_runner_title"
    titleLabel.font = .preferredFont(forTextStyle: .headline)

    textField.translatesAutoresizingMaskIntoConstraints = false
    textField.borderStyle = .roundedRect
    textField.placeholder = "owned runner input"
    textField.accessibilityIdentifier = "owned_runner_input"

    tapButton.translatesAutoresizingMaskIntoConstraints = false
    tapButton.setTitle("Owned Tap Target", for: .normal)
    tapButton.accessibilityIdentifier = "owned_runner_tap_target"
    tapButton.addTarget(self, action: #selector(handleTapButton), for: .touchUpInside)

    statusLabel.translatesAutoresizingMaskIntoConstraints = false
    statusLabel.text = "idle"
    statusLabel.accessibilityIdentifier = "owned_runner_status"
    statusLabel.textColor = .secondaryLabel

    let stack = UIStackView(arrangedSubviews: [titleLabel, textField, tapButton, statusLabel])
    stack.translatesAutoresizingMaskIntoConstraints = false
    stack.axis = .vertical
    stack.spacing = 12

    view.addSubview(stack)
    NSLayoutConstraint.activate([
      stack.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      stack.centerYAnchor.constraint(equalTo: view.centerYAnchor),
      stack.widthAnchor.constraint(equalToConstant: 240),
    ])
  }

  @objc
  private func handleTapButton() {
    statusLabel.text = "tap_executed"
  }
}
