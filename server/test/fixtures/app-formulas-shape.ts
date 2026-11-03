// Synthetic Contoso field service App fixture with the canonical compile-path shape.
// Byte-exact companion to app-formulas-shape.pa.yaml for the filesystem-free Vitest runtime.
// Block scalars and Swedish non-ASCII strings are intentional.
export const APP_FORMULAS_SHAPE = `App:
  Properties:
    Theme: =PowerAppsTheme
    StartScreen: =DispatchScreen
    BackEnabled: =true
    Formulas: |-
      =ThemeBg = RGBA(237, 242, 249, 1);
      ThemeSurface = RGBA(252, 253, 254, 1);
      ThemeSurface2 = RGBA(243, 247, 252, 1);
      PaletteIndigo = RGBA(72, 64, 143, 1);
      PaletteIndigoMid = RGBA(104, 97, 176, 1);
      PaletteIndigoPale = RGBA(233, 230, 248, 1);
      PaletteIndigoDeep = RGBA(45, 38, 103, 1);
      PaletteCyan = RGBA(28, 112, 139, 1);
      PaletteCyanMid = RGBA(58, 151, 178, 1);
      PaletteCyanPale = RGBA(222, 243, 249, 1);
      PaletteCyanDeep = RGBA(19, 73, 96, 1);
      PaletteOchre = RGBA(158, 112, 47, 1);
      PaletteOchrePale = RGBA(249, 239, 217, 1);
      PaletteOchreDeep = RGBA(108, 77, 33, 1);
      PaletteMoss = RGBA(83, 121, 68, 1);
      PaletteMossPale = RGBA(231, 244, 223, 1);
      InkPrimary = RGBA(33, 39, 53, 1);
      InkSecondary = RGBA(89, 100, 117, 1);
      InkMuted = RGBA(144, 152, 169, 1);
      OutlineTint = RGBA(67, 81, 106, 0.14);
      AgentMailbox = User().Email;
      AssignedAgent = LookUp(DemoAgents, demo_mailbox = AgentMailbox);
      AgentMonogram = Upper(Left(Trim(Substitute(AssignedAgent.demo_displaylabel, "~", "")), 2));
      AssignedJobs = Filter(DemoWorkItems, demo_assignee.demo_agentid = AssignedAgent.demo_agentid);
      JobsDueToday = Filter(AssignedJobs, IsToday(demo_plannedtime));
      KitSensor = LookUp(DemoInventory, demo_stockcode = "CT-410").demo_kitgroup;
      KitMeter = LookUp(DemoInventory, demo_stockcode = "CT-520").demo_kitgroup;
      KitBeacon = LookUp(DemoInventory, demo_stockcode = "CT-630").demo_kitgroup;
      KitSensorExtra = LookUp(DemoInventory, demo_stockcode = "CT-415").demo_kitgroup;
      KitMeterExtra = LookUp(DemoInventory, demo_stockcode = "CT-525").demo_kitgroup;
      KitBeaconExtra = LookUp(DemoInventory, demo_stockcode = "CT-635").demo_kitgroup;
      InitialReviewState = First(Choices(DemoReviews.demo_reviewstate)).Value;
      FormatScore(points: Number): Text = Substitute(Substitute(Text(points, "0.0", "sv-SE"), ".", ":"), ",", ":") & " poäng";
      PlannedMoment(moment: DateTime): DateTime = moment;
      FormatWindow(opens: DateTime, closes: DateTime): Text = Text(opens, "hh:mm:ss") & " till " & Text(closes, "hh:mm:ss");
      FormatCalendarDay(moment: DateTime): Text = Text(moment, "yyyy-mm-dd", "sv-SE");
      FormatWeekday(moment: DateTime): Text = Proper(Text(moment, "dddd", "sv-SE"));
      FormatCalendarMonth(moment: DateTime): Text = Proper(Text(moment, "mmmm", "sv-SE"));
      FormatStockCode(code: Text): Text = "Lagerkod: " & code;
      DispatchReference(reference: Text): Text = Coalesce(reference, "Kö på granskningslistan");
      ReviewReference(reference: Text): Text = Coalesce(reference, "Saknar ärendenummer");
      JobStateLabel(complete: Boolean, planned: DateTime): Text = If(complete, "Klar för arkiv", If(IsToday(planned), "Dagens uppdrag", If(planned < Today(), "Äldre uppdrag", "Nästa uppdrag")));
      JobStateFill(complete: Boolean, planned: DateTime): Color = If(complete, PaletteMossPale, If(IsToday(planned), PaletteCyanPale, If(planned < Today(), RGBA(235, 240, 247, 1), PaletteOchrePale)));
      JobStateColor(complete: Boolean, planned: DateTime): Color = If(complete, PaletteMoss, If(IsToday(planned), PaletteCyanDeep, If(planned < Today(), InkMuted, PaletteOchreDeep)))
    OnError: |-
      =Notify("Åtgärd avbröts: " & FirstError.Message, NotificationType.Error, 4500)
`;
