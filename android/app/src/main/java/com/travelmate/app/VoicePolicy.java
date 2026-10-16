package com.travelmate.app;
/** Pure bounds/error policy, shared with Android JVM regression tests. */
final class VoicePolicy {
    static int hebrewRank(String locale){return locale!=null&&locale.matches("(?i)(he|iw)-IL")?2:locale!=null&&locale.matches("(?i)(he|iw)(-.*)?")?1:0;}
    static boolean stopCommand(String text) { return text!=null && text.trim().replaceAll("[.!?׃]+$", "").trim().matches("(?i)(עצור|תעצור|תפסיק|די|stop)"); }
    static boolean interruptAllowed(boolean foreground,boolean permission,boolean speaking,String session,String target,String active,String authorized) { return foreground && permission && speaking && validSession(session) && validSession(target) && target.equals(active) && target.equals(authorized) && !session.equals(target); }
    static <T> T firstUsable(java.util.List<T> values,java.util.function.Predicate<T> select){for(T value:values)if(select.test(value))return value;return null;}
    static boolean validSession(String value){return value!=null&&value.matches("voice-[a-zA-Z0-9]{8,40}-[0-9]{1,16}");}
    static float delivery(double value,float min,float max){return Double.isFinite(value)?Math.max(min,Math.min(max,(float)value)):1f;}
    static String recognitionError(int code){switch(code){case 9:return "not-allowed";case 6:case 7:return "no-speech";case 1:case 2:return "network";case 12:case 13:return "language-not-supported";case 8:return "recognizer-busy";default:return "service-not-allowed";}}
}
