import Capacitor

final class TravelMateBridgeViewController: CAPBridgeViewController {
    override public func capacitorDidLoad() {
        bridge?.registerPluginInstance(TravelMateWidgetBridgePlugin())
    }
}
