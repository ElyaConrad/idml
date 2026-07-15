#target indesign
// Canonical InDesign feature generator. Each feature = fresh 1080x1350pt doc, isolate ONE
// feature, export IDML + a 72ppi PNG (ground-truth) into demo/feat_id/feat-<name>/.
// Text features use Arial (universal) and copy Arial.ttf into the case so OUR render matches.
app.scriptPreferences.userInteractionLevel = UserInteractionLevels.NEVER_INTERACT;
var ROOT = "/Users/mauriceconrad/Documents/Bluepic/Modules/idml/demo/feat_id";
var ARIAL = "/System/Library/Fonts/Supplemental/Arial.ttf";

function makeDoc() {
  var d = app.documents.add();
  d.documentPreferences.facingPages = false;
  d.viewPreferences.horizontalMeasurementUnits = MeasurementUnits.POINTS;
  d.viewPreferences.verticalMeasurementUnits = MeasurementUnits.POINTS;
  d.documentPreferences.pageWidth = 1080;
  d.documentPreferences.pageHeight = 1350;
  return d;
}
function col(d, name, space, vals) {
  try { return d.colors.item(name).isValid ? d.colors.item(name) : d.colors.add({model:ColorModel.PROCESS, space:space, colorValue:vals, name:name}); }
  catch(e) { return d.colors.add({model:ColorModel.PROCESS, space:space, colorValue:vals, name:name}); }
}
function rgb(d,n,r,g,b){ return col(d,n,ColorSpace.RGB,[r,g,b]); }
function rect(page,y,x,h,w){ var r=page.rectangles.add(); r.geometricBounds=[y,x,y+h,x+w]; r.strokeWeight=0; return r; }
function caption(page,t){ var tf=page.textFrames.add(); tf.geometricBounds=[24,40,70,1040]; tf.contents=t; var s=tf.texts[0]; s.appliedFont=app.fonts.item("Arial"); s.pointSize=24; return tf; }

function finish(d, name, isText) {
  var dir = new Folder(ROOT + "/feat-" + name); if(!dir.exists) dir.create();
  d.exportFile(ExportFormat.INDESIGN_MARKUP, new File(dir.fsName + "/feat-" + name + ".idml"));
  app.pngExportPreferences.exportResolution = 72;
  app.pngExportPreferences.pngExportRange = PNGExportRangeEnum.EXPORT_ALL;
  d.exportFile(ExportFormat.PNG_FORMAT, new File(dir.fsName + "/feat-" + name + ".png"));
  if (isText) { var df=new Folder(dir.fsName+"/Document fonts"); if(!df.exists) df.create(); new File(ARIAL).copy(new File(df.fsName+"/Arial.ttf")); }
  d.close(SaveOptions.NO);
}

// ---- features ----
var F = {};
F["gradient-linear"] = function(d,p){ caption(p,"C6 linear gradient");
  var g=d.gradients.add(); g.type=GradientType.LINEAR;
  g.gradientStops[0].stopColor=rgb(d,"gA",224,49,49); g.gradientStops[0].location=0;
  g.gradientStops[-1].stopColor=rgb(d,"gB",51,102,255); g.gradientStops[-1].location=100;
  var r=rect(p,200,140,700,800); r.fillColor=g; r.gradientFillAngle=0; };
F["gradient-radial"] = function(d,p){ caption(p,"C7 radial gradient");
  var g=d.gradients.add(); g.type=GradientType.RADIAL;
  g.gradientStops[0].stopColor=rgb(d,"rA",255,220,0); g.gradientStops[-1].stopColor=rgb(d,"rB",200,20,60);
  var r=rect(p,250,240,600,600); r.fillColor=g; };
F["cmyk"] = function(d,p){ caption(p,"C2 CMYK");
  var cs=[["c",[100,0,0,0]],["m",[0,100,0,0]],["y",[0,0,100,0]],["k",[0,0,0,100]]];
  for(var i=0;i<4;i++){ var r=rect(p,200,40+i*250,400,220); r.fillColor=col(d,"cmyk"+i,ColorSpace.CMYK,cs[i][1]); } };
F["stroke-align"] = function(d,p){ caption(p,"C10 stroke align center/inside/outside");
  var al=[StrokeAlignment.CENTER_ALIGNMENT,StrokeAlignment.INSIDE_ALIGNMENT,StrokeAlignment.OUTSIDE_ALIGNMENT];
  for(var i=0;i<3;i++){ var r=rect(p,250,80+i*320,240,240); r.fillColor=rgb(d,"sf",245,245,245); r.strokeColor=rgb(d,"sk",20,20,20); r.strokeWeight=24; r.strokeAlignment=al[i]; } };
F["stroke-dashed"] = function(d,p){ caption(p,"C12 dashed stroke");
  var r=rect(p,300,140,300,800); r.fillColor=rgb(d,"df",250,250,250); r.strokeColor=rgb(d,"dk",20,20,20); r.strokeWeight=12; r.strokeType=d.strokeStyles.item("Dashed"); };
F["corner-rounded"] = function(d,p){ caption(p,"B7 rounded corner"); var r=rect(p,250,140,300,300); r.fillColor=rgb(d,"c1",224,49,49); r.topLeftCornerOption=r.topRightCornerOption=r.bottomLeftCornerOption=r.bottomRightCornerOption=CornerOptions.ROUNDED_CORNER; r.topLeftCornerRadius=r.topRightCornerRadius=r.bottomLeftCornerRadius=r.bottomRightCornerRadius=60; };
F["corner-bevel"] = function(d,p){ caption(p,"B9 bevel corner"); var r=rect(p,250,140,300,300); r.fillColor=rgb(d,"c2",45,160,90); r.topLeftCornerOption=r.topRightCornerOption=r.bottomLeftCornerOption=r.bottomRightCornerOption=CornerOptions.BEVEL_CORNER; r.topLeftCornerRadius=r.topRightCornerRadius=r.bottomLeftCornerRadius=r.bottomRightCornerRadius=60; };
F["corner-fancy"] = function(d,p){ caption(p,"B10 fancy corner"); var r=rect(p,250,140,300,300); r.fillColor=rgb(d,"c3",51,102,255); r.topLeftCornerOption=r.topRightCornerOption=r.bottomLeftCornerOption=r.bottomRightCornerOption=CornerOptions.FANCY_CORNER; r.topLeftCornerRadius=r.topRightCornerRadius=r.bottomLeftCornerRadius=r.bottomRightCornerRadius=60; };
F["corner-inset"] = function(d,p){ caption(p,"B8 inset corner"); var r=rect(p,250,140,300,300); r.fillColor=rgb(d,"c4",160,60,200); r.topLeftCornerOption=r.topRightCornerOption=r.bottomLeftCornerOption=r.bottomRightCornerOption=CornerOptions.INSET_CORNER; r.topLeftCornerRadius=r.topRightCornerRadius=r.bottomLeftCornerRadius=r.bottomRightCornerRadius=60; };
F["drop-shadow"] = function(d,p){ caption(p,"E3 drop shadow"); var r=rect(p,300,300,300,300); r.fillColor=rgb(d,"ds",255,255,255);
  var t=r.transparencySettings.dropShadowSettings; t.mode=ShadowMode.DROP; t.xOffset=0; t.yOffset=18; t.size=30; t.opacity=60; t.effectColor=rgb(d,"dsc",0,0,0); };
F["inner-shadow"] = function(d,p){ caption(p,"E5 inner shadow"); var r=rect(p,300,300,300,300); r.fillColor=rgb(d,"is",240,240,240);
  var t=r.transparencySettings.innerShadowSettings; t.applied=true; t.xOffset=0; t.yOffset=12; t.size=24; t.opacity=70; t.effectColor=rgb(d,"isc",0,0,0); };
F["outer-glow"] = function(d,p){ caption(p,"E6 outer glow"); var r=rect(p,300,300,300,300); r.fillColor=rgb(d,"og",30,30,30);
  var t=r.transparencySettings.outerGlowSettings; t.applied=true; t.size=40; t.opacity=85; t.effectColor=rgb(d,"ogc",0,200,255); };
F["inner-glow"] = function(d,p){ caption(p,"E7 inner glow"); var r=rect(p,300,300,300,300); r.fillColor=rgb(d,"ig",30,30,30);
  var t=r.transparencySettings.innerGlowSettings; t.applied=true; t.size=40; t.opacity=85; t.effectColor=rgb(d,"igc",255,220,0); };
F["bevel-emboss"] = function(d,p){ caption(p,"E8 bevel & emboss"); var r=rect(p,300,300,300,300); r.fillColor=rgb(d,"be",180,180,190);
  var t=r.transparencySettings.bevelAndEmbossSettings; t.applied=true; t.size=18; t.depth=100; };
F["satin"] = function(d,p){ caption(p,"E9 satin"); var r=rect(p,300,300,300,300); r.fillColor=rgb(d,"sa",120,60,200);
  var t=r.transparencySettings.satinSettings; t.applied=true; t.opacity=60; t.effectColor=rgb(d,"sac",0,0,0); };
F["feather-basic"] = function(d,p){ caption(p,"E10 basic feather"); var r=rect(p,300,300,300,300); r.fillColor=rgb(d,"fb",224,49,49);
  var t=r.transparencySettings.featherSettings; t.mode=FeatherMode.STANDARD; t.width=40; };
F["feather-gradient"] = function(d,p){ caption(p,"E12 gradient feather"); var r=rect(p,300,300,300,300); r.fillColor=rgb(d,"fg",45,120,200);
  var t=r.transparencySettings.gradientFeatherSettings; t.applied=true; };
F["blend-multiply"] = function(d,p){ caption(p,"E2 blend multiply"); rect(p,300,140,400,800).fillColor=rgb(d,"bg",255,200,0);
  var r=rect(p,420,300,400,500); r.fillColor=rgb(d,"bm",0,120,255); r.transparencySettings.blendingSettings.blendMode=BlendMode.MULTIPLY; };
F["opacity"] = function(d,p){ caption(p,"E1 opacity 100/60/30"); rect(p,500,60,300,960).fillColor=rgb(d,"ob",20,20,20);
  var o=[100,60,30]; for(var i=0;i<3;i++){ var r=rect(p,150,90+i*320,700,220); r.fillColor=rgb(d,"of",255,90,0); r.transparencySettings.blendingSettings.opacity=o[i]; } };
F["layer-hidden"] = function(d,p){ caption(p,"A7 hidden layer must NOT render");
  rect(p,300,140,300,300).fillColor=rgb(d,"vis",45,160,90);
  var L=d.layers.add({name:"hidden"}); var r=rect(p,300,600,300,300); r.itemLayer=L; r.fillColor=rgb(d,"hid",224,49,49); L.visible=false; };
F["nonprinting"] = function(d,p){ caption(p,"A9 nonprinting must NOT render");
  rect(p,300,140,300,300).fillColor=rgb(d,"np1",45,160,90);
  var r=rect(p,300,600,300,300); r.fillColor=rgb(d,"np2",224,49,49); r.nonprinting=true; };
F["object-invisible"] = function(d,p){ caption(p,"A8 invisible object must NOT render");
  rect(p,300,140,300,300).fillColor=rgb(d,"iv1",45,160,90);
  var r=rect(p,300,600,300,300); r.fillColor=rgb(d,"iv2",224,49,49); r.visible=false; };
// text
F["text-underline"] = function(d,p){ caption(p,"F10/F11 underline default+custom");
  var t1=p.textFrames.add(); t1.geometricBounds=[220,80,360,1000]; t1.contents="Default underline"; var s1=t1.texts[0]; s1.appliedFont=app.fonts.item("Arial"); s1.pointSize=64; s1.underline=true;
  var t2=p.textFrames.add(); t2.geometricBounds=[420,80,560,1000]; t2.contents="Custom underline"; var s2=t2.texts[0]; s2.appliedFont=app.fonts.item("Arial"); s2.pointSize=64; s2.underline=true; s2.underlineWeight=10; s2.underlineOffset=-6; s2.underlineColor=rgb(d,"ul",255,200,0); };
F["text-strike-caps"] = function(d,p){ caption(p,"F12/F8 strike + allcaps + smallcaps");
  var mk=function(y,txt,fn){ var t=p.textFrames.add(); t.geometricBounds=[y,80,y+130,1000]; t.contents=txt; var s=t.texts[0]; s.appliedFont=app.fonts.item("Arial"); s.pointSize=64; fn(s); };
  mk(220,"Strikethrough",function(s){s.strikeThru=true;}); mk(420,"all caps",function(s){s.capitalization=Capitalization.ALL_CAPS;}); mk(620,"Small Caps",function(s){s.capitalization=Capitalization.SMALL_CAPS;}); };
F["text-stroke"] = function(d,p){ caption(p,"F14 outlined text"); var t=p.textFrames.add(); t.geometricBounds=[380,80,680,1000]; t.contents="OUTLINE"; var s=t.texts[0]; s.appliedFont=app.fonts.item("Arial"); s.fontStyle="Bold"; s.pointSize=180; s.fillColor=rgb(d,"tf",255,255,255); s.strokeColor=rgb(d,"tk",20,20,20); s.strokeWeight=4; };
F["para-shading"] = function(d,p){ caption(p,"P-shading paragraph background");
  var t=p.textFrames.add(); t.geometricBounds=[240,80,900,1000]; t.contents="Paragraph shading\ndraws a fill behind\nthe whole paragraph."; var pr=t.paragraphs[0]; pr.appliedFont=app.fonts.item("Arial"); pr.pointSize=64; pr.paragraphShadingOn=true; pr.paragraphShadingColor=rgb(d,"psc",255,220,0); };
F["para-rules"] = function(d,p){ caption(p,"P8 rule above/below");
  var t=p.textFrames.add(); t.geometricBounds=[300,80,520,1000]; t.contents="Heading with rules"; var pr=t.paragraphs[0]; pr.appliedFont=app.fonts.item("Arial"); pr.pointSize=64;
  pr.ruleAbove=true; pr.ruleAboveLineWeight=6; pr.ruleAboveColor=rgb(d,"ra",224,49,49); pr.ruleBelow=true; pr.ruleBelowLineWeight=6; pr.ruleBelowColor=rgb(d,"rb",51,102,255); };
F["tabs-leader"] = function(d,p){ caption(p,"P7 tab + dot leader");
  var t=p.textFrames.add(); t.geometricBounds=[240,80,700,1000]; t.contents="Item\tPrice\nCoffee\t3.50\nCake\t4.20"; var s=t.texts[0]; s.appliedFont=app.fonts.item("Arial"); s.pointSize=56;
  var ts=t.paragraphs[0].tabStops.add({position:820,alignment:TabStopAlignment.RIGHT_ALIGN,leader:"."}); };

// ---- run ----
var results = [];
for (var name in F) {
  if (!F.hasOwnProperty(name)) continue;
  var isText = name.indexOf("text")===0 || name.indexOf("para")===0 || name.indexOf("tabs")===0;
  try { var d=makeDoc(); var p=d.pages[0]; F[name](d,p); finish(d,name,isText); results.push("OK "+name); }
  catch(e){ results.push("ERR "+name+": "+e); try{d.close(SaveOptions.NO);}catch(e2){} }
}
results.join("\n");
