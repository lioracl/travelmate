package com.travelmate.app;
import org.junit.Test;
import static org.junit.Assert.*;
import java.util.*;
public class RecognitionSessionTest {
 static class Fixture implements RecognitionSession.Clock {
  Map<Runnable,Long> tasks=new HashMap<>(); long now; int stops,errors;
  RecognitionSession session=new RecognitionSession(this,()->stops++,()->errors++);
  public void post(Runnable r,long delay){tasks.put(r,now+delay);}
  public void remove(Runnable r){tasks.remove(r);}
  void advance(long delta){now+=delta;for(Runnable r:new ArrayList<>(tasks.keySet()))if(tasks.containsKey(r)&&tasks.get(r)<=now){tasks.remove(r);r.run();}}
 }
 @Test public void automaticEndStopsWithoutTap(){Fixture f=new Fixture();f.session.beginning();f.session.end();f.advance(350);assertEquals(1,f.stops);assertTrue(f.session.finish());assertTrue(f.tasks.isEmpty());}
 @Test public void resultsBeforeEndTimerCancelStop(){Fixture f=new Fixture();f.session.end();f.session.finish();f.advance(40000);assertEquals(0,f.stops);assertEquals(0,f.errors);}
 @Test public void repeatedStopIsIdempotent(){Fixture f=new Fixture();f.session.stop();f.session.stop();f.session.end();assertEquals(1,f.stops);}
 @Test public void partialFallbackRequestsFinalResult(){Fixture f=new Fixture();f.session.partial("hello");f.advance(2200);assertEquals(1,f.stops);assertEquals(0,f.errors);}
 @Test public void changingPartialExtendsSilence(){Fixture f=new Fixture();f.session.partial("one");f.advance(1800);f.session.partial("one two");f.advance(500);assertEquals(0,f.stops);f.advance(1700);assertEquals(1,f.stops);}
 @Test public void duplicatePartialDoesNotPostponeForever(){Fixture f=new Fixture();f.session.partial("one");f.advance(2000);f.session.partial("one");f.advance(200);assertEquals(1,f.stops);}
 @Test public void cancelAndLifecycleDiscardLateEvents(){Fixture f=new Fixture();f.session.finish();f.session.partial("late");f.session.end();f.session.stop();f.advance(40000);assertEquals(0,f.stops);assertEquals(0,f.errors);}
 @Test public void noProviderSignalsTerminates(){Fixture f=new Fixture();f.advance(30000);assertEquals(1,f.errors);assertFalse(f.session.finish());}
 @Test public void stopWithoutResultsTimesOutOnce(){Fixture f=new Fixture();f.session.stop();f.advance(6000);f.advance(40000);assertEquals(1,f.errors);assertTrue(f.tasks.isEmpty());}
 @Test public void speechResumptionCancelsEndTimer(){Fixture f=new Fixture();f.session.end();f.session.beginning();f.advance(350);assertEquals(0,f.stops);}
 @Test public void duplicateCompletionRejected(){Fixture f=new Fixture();assertTrue(f.session.finish());assertFalse(f.session.finish());}
 @Test public void emptyPartialNeverFinalizes(){Fixture f=new Fixture();f.session.partial(" ");f.advance(2200);assertEquals(0,f.stops);}
}
