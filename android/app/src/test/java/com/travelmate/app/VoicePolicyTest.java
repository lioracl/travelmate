package com.travelmate.app;
import org.junit.Test;import static org.junit.Assert.*;
public class VoicePolicyTest {
 @Test public void unavailableRequestedVoiceFallsBack(){java.util.List<String> voices=java.util.Arrays.asList("saved-but-unusable","hebrew","english");assertEquals("hebrew",VoicePolicy.firstUsable(voices,v->!v.startsWith("saved")));assertNull(VoicePolicy.firstUsable(voices,v->false));}
 @Test public void sessionBoundary(){assertTrue(VoicePolicy.validSession("voice-document123-42"));assertFalse(VoicePolicy.validSession(""));assertFalse(VoicePolicy.validSession("other-account"));assertFalse(VoicePolicy.validSession("voice-1/../../"));}
 @Test public void boundedStyles(){assertEquals(0.8f,VoicePolicy.delivery(0.1,0.8f,1.2f),0.001f);assertEquals(1.2f,VoicePolicy.delivery(5,0.8f,1.2f),0.001f);assertEquals(1f,VoicePolicy.delivery(Double.NaN,0f,1f),0.001f);assertEquals(0.82f,VoicePolicy.delivery(0.82,0f,1f),0.001f);}
 @Test public void actionableRecognitionErrors(){assertEquals("not-allowed",VoicePolicy.recognitionError(9));assertEquals("no-speech",VoicePolicy.recognitionError(7));assertEquals("network",VoicePolicy.recognitionError(2));assertEquals("language-not-supported",VoicePolicy.recognitionError(12));assertEquals("service-not-allowed",VoicePolicy.recognitionError(999));}
}
