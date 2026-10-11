package com.travelmate.app;

import static org.junit.Assert.*;
import android.content.Intent;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.junit.FixMethodOrder;
import org.junit.runners.MethodSorters;
import org.json.JSONObject;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/** Local emulator acceptance. Requires the signed fixtures on loopback port 4186.
 * Never targets a physical device; the runner must set ANDROID_SERIAL=emulator-5580.
 * Reads only app version diagnostics and the explicitly synthetic ota-proof-* data.
 */
@RunWith(AndroidJUnit4.class)
@FixMethodOrder(MethodSorters.NAME_ASCENDING)
public class OtaAcceptanceTest {
    private MainActivity activity;
    private void launch() throws Exception {
        assertTrue("Only an isolated emulator is authorized", android.os.Build.FINGERPRINT.contains("generic") || android.os.Build.MODEL.contains("sdk_gphone"));
        Intent intent = new Intent(InstrumentationRegistry.getInstrumentation().getTargetContext(), MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        activity=(MainActivity)InstrumentationRegistry.getInstrumentation().startActivitySync(intent);
    }
    private String js(String expression) throws Exception {
        AtomicReference<String> value=new AtomicReference<>(); CountDownLatch done=new CountDownLatch(1);
        InstrumentationRegistry.getInstrumentation().runOnMainSync(()->activity.getBridge().getWebView().evaluateJavascript(expression,result->{value.set(result);done.countDown();}));
        assertTrue("WebView result",done.await(5,TimeUnit.SECONDS));return value.get();
    }
    private JSONObject async(String expression) throws Exception {
        js("window.__otaAcceptance=null;Promise.resolve("+expression+").then(value=>window.__otaAcceptance={ok:true,value:value}).catch(error=>window.__otaAcceptance={ok:false,error:String(error.message||error)})");
        for(int i=0;i<150;i++){String result=js("window.__otaAcceptance");if(result!=null&&!result.equals("null"))return new JSONObject(result);Thread.sleep(200);}
        throw new AssertionError("Timed out waiting for native API");
    }
    private void awaitBuild(String sha) throws Exception {
        for(int i=0;i<180;i++){if(js("window.TravelMateWebBuild&&window.TravelMateWebBuild.sha").equals(JSONObject.quote(sha)))return;Thread.sleep(200);}
        throw new AssertionError("Expected build "+sha+"; actual "+js("window.TravelMateWebBuild"));
    }
    @Test public void a_nextStartActivatesSignedBuildBOfflineAndPreservesData() throws Exception {
        launch();awaitBuild("19a736f7c82a321d53d9ee89a7c2a0f09043bffb");
        assertEquals("false",js("!!navigator.serviceWorker?.controller"));
        assertEquals("true",js("!!window.TravelMateFeatures"));
        assertTrue(js("localStorage.getItem('ota-proof-trip')").contains("synthetic-QA"));
        JSONObject doc=async("new Promise(resolve=>{const r=indexedDB.open('ota-proof-documents',1);r.onsuccess=()=>{const db=r.result,q=db.transaction('metadata').objectStore('metadata').get('qa');q.onsuccess=()=>{resolve(q.result);db.close()}}})");
        assertTrue(doc.toString(),doc.getBoolean("ok"));assertEquals("synthetic-document",doc.getJSONObject("value").getString("name"));
        JSONObject current=async("Capacitor.Plugins.LiveUpdate.getCurrentBundle()");
        assertEquals("19a736f7c82a321d53d9ee89a7c2a0f09043bffb",current.getJSONObject("value").getString("bundleId"));
    }
    @Test public void b_badSignatureIsRejectedByNativePlugin() throws Exception {
        launch();awaitBuild("19a736f7c82a321d53d9ee89a7c2a0f09043bffb");
        JSONObject result=async("Capacitor.Plugins.LiveUpdate.downloadBundle({bundleId:'invalid-signature-fixture',artifactType:'zip',url:'https://localhost:4186/ota/19a736f7c82a321d53d9ee89a7c2a0f09043bffb/bundle.zip',signature:'AA=='})");
        assertFalse(result.toString(),result.getBoolean("ok"));assertTrue(result.toString(),result.getString("error").toLowerCase().contains("signature"));
    }
    @Test public void c_incompatibleSignedMetadataIsNotStaged() throws Exception {
        launch();awaitBuild("19a736f7c82a321d53d9ee89a7c2a0f09043bffb");
        String source=new String(InstrumentationRegistry.getInstrumentation().getTargetContext().getAssets().open("public/assets/native-live-update.js").readAllBytes(),java.nio.charset.StandardCharsets.UTF_8);
        js("window.__originalFetch=window.fetch.bind(window);window.fetch=(url,options)=>window.__originalFetch(String(url).endsWith('/ota/latest.json')?'https://localhost:4186/incompatible.json':url,options)");
        js(source);
        for(int i=0;i<60&&js("window.TravelMateNativeUpdate.status").equals("\"checking\"");i++)Thread.sleep(200);
        assertEquals("\"unavailable\"",js("window.TravelMateNativeUpdate.status"));
        JSONObject next=async("Capacitor.Plugins.LiveUpdate.getNextBundle()");
        assertNotEquals("cccccccccccccccccccccccccccccccccccccccc",next.getJSONObject("value").optString("bundleId"));
    }
    @Test public void d_failedActivationFallsBackToEmbeddedDefaultWithoutDeletingData() throws Exception {
        launch();awaitBuild("19a736f7c82a321d53d9ee89a7c2a0f09043bffb");
        JSONObject staged=async("fetch('https://localhost:4186/broken.json').then(r=>r.json()).then(async m=>{await Capacitor.Plugins.LiveUpdate.downloadBundle({bundleId:m.sha,url:'https://localhost:4186/broken.zip',artifactType:'zip',signature:m.signature,checksum:m.sha256});await Capacitor.Plugins.LiveUpdate.setNextBundle({bundleId:m.sha});return true})");
        assertTrue(staged.toString(),staged.getBoolean("ok"));
        InstrumentationRegistry.getInstrumentation().runOnMainSync(()->activity.finish());
        launch();
        awaitBuild("83342066979cddad32b953220a0c464f57bfbee3");
        assertTrue(js("localStorage.getItem('ota-proof-trip')").contains("synthetic-QA"));
        assertEquals("false",js("!!navigator.serviceWorker?.controller"));
        JSONObject blocked=async("Capacitor.Plugins.LiveUpdate.getBlockedBundles()");assertTrue(blocked.toString().contains("dddddddddddddddddddddddddddddddddddddddd"));
    }
}
