package com.travelmate.app;

/** Per-request endpoint watchdog. Only onResults may supply a final transcript. */
final class RecognitionSession {
    interface Clock { void post(Runnable task, long delay); void remove(Runnable task); }
    private final Clock clock;
    private final Runnable stop, timeout;
    private final Runnable endpoint = this::stop;
    private final Runnable deadline = this::expire;
    private boolean terminal, stopping;
    private String partial = "";
    RecognitionSession(Clock clock, Runnable stop, Runnable timeout) {
        this.clock = clock; this.stop = stop; this.timeout = timeout;
        clock.post(deadline, 30000);
    }
    void beginning() { if (!terminal && !stopping) clock.remove(endpoint); }
    void end() { if (!terminal && !stopping) { clock.remove(endpoint); clock.post(endpoint, 350); } }
    // Some providers omit end-of-speech. Stable partial text requests finalization,
    // but is NEVER promoted to a final result or sent to the application.
    void partial(String text) {
        if (terminal || stopping || text == null || text.trim().isEmpty() || text.equals(partial)) return;
        partial = text; clock.remove(endpoint); clock.post(endpoint, 2200);
    }
    void stop() {
        if (terminal || stopping) return;
        stopping = true; clock.remove(endpoint); clock.remove(deadline);
        clock.post(deadline, 6000); stop.run();
    }
    boolean finish() {
        if (terminal) return false;
        terminal = true; clock.remove(endpoint); clock.remove(deadline); return true;
    }
    private void expire() { if (finish()) timeout.run(); }
}
