const {trip,open:openOverview}=require('./overview-v3.cjs');
const record={...trip,id:'plan-v3',start:'2026-10-16',end:'2026-10-20',days:5,dayNotes:{'2026-10-17':'זמן חופשי בין הפעילויות'},activities:[
 {id:'past',date:'2026-10-16',time:'10:00',title:'היכרות עם העיר',duration:60,category:'attraction',done:true},
 {id:'done',date:'2026-10-17',time:'08:00',title:'ארוחת בוקר',duration:60,category:'restaurant',done:true},
 {id:'current',date:'2026-10-17',time:'10:00',title:'קולוסיאום · Colosseo',duration:90,category:'attraction',scheduleMode:'fixed',locationName:'Piazza del Colosseo',description:'ביקור באמפיתיאטרון העתיק',image:'https://images.unsplash.com/photo-1552832230-c0197dd311b5?auto=format&fit=crop&w=400&q=80'},
 {id:'next',date:'2026-10-17',time:'14:00',title:'מזרקת טרווי',duration:60,category:'attraction',scheduleMode:'fixed',locationName:'Fontana di Trevi'},
 {id:'flex',date:'2026-10-17',time:'17:00',title:'טיול חופשי',duration:30,category:'attraction',scheduleMode:'flexible'},
 {id:'future',date:'2026-10-19',time:'11:00',title:'מוזיאון ברומא',duration:90,category:'museum'}
],savedPlaces:[{id:'saved',date:'2026-10-17',time:'18:00',name:'כיכר נבונה',duration:45,category:'attraction',address:'Piazza Navona, Roma',description:'מקום שמור בתוכנית'}]};
async function open(page,options={}){
 await openOverview(page,{...options,record:options.record||record,preserveTrip:true});
 await page.locator(page.viewportSize().width>1000?'.sidebar [data-view="plan"]':'[data-shell-view="plan"]').click();
 await page.waitForFunction(()=>document.querySelector('#plan [data-plan-days] button')&&document.querySelector('#plan [data-plan-activity-state]'));
 await page.waitForFunction(()=>Array.from(document.querySelectorAll('link[rel="stylesheet"]')).filter(link=>link.href.startsWith(location.origin)).every(link=>link.sheet));
}
module.exports={record,open};
