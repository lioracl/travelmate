import Capacitor

final class TravelMateBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(TravelMateWidgetBridgePlugin())
    }
}
