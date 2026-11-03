# PowerApps Classic Icon Reference

> **Icon audit (2026-07-19):** `server/src/generated/catalog.ts` does not expose a classic `Icon` enum in `ENUMS`, so the names below cannot be exhaustively diffed against the generated catalog. The rejected Left/Right members have been replaced by `Icon.ChevronLeft` and `Icon.ChevronRight`. A **✓ compile-verified** marker identifies the names verified through `compile_canvas`; unmarked names remain reference-only rather than compiler-verified.
>
> <!-- verified: true, verified_at: 2026-07-19, verified_by: compile_canvas -->

## Control: Classic/Icon@2.5.0

**Use Classic/Icon when you need OnSelect (clickable icons).**
Modern Icon@0.0.7 has NO OnSelect property - it's display-only!

## Schema

```yaml
- iconExample:
    Control: Classic/Icon@2.5.0
    Properties:
      Icon: =Icon.Home
      Color: =RGBA(255, 255, 255, 1)
      HoverColor: =RGBA(255, 255, 255, 0.8)
      PressedColor: =RGBA(255, 255, 255, 0.6)
      Height: =24
      Width: =24
      X: =0
      Y: =0
      OnSelect: =Navigate(Screen1)
```

## Properties

| Property | Description |
|----------|-------------|
| `Icon` | Icon enum: `=Icon.Home` |
| `Color` | Default color |
| `HoverColor` | Color on hover |
| `PressedColor` | Color when pressed |
| `OnSelect` | Click handler |

---

## All Available Classic Icons

### Actions
| Icon Name | Usage |
|-----------|-------|
| `Icon.Add` | Plus sign |
| `Icon.Cancel` | X mark |
| `Icon.CancelBadge` | X in circle |
| `Icon.Edit` | Pencil |
| `Icon.Check` **✓ compile-verified** | Checkmark |
| `Icon.CheckBadge` | Checkmark in circle |
| `Icon.Search` | Magnifying glass |
| `Icon.Filter` | Filter funnel |
| `Icon.FlatFilter` | Flat filter |
| `Icon.FlatFilterFilled` | Filled flat filter |
| `Icon.Sort` | Sort arrows |
| `Icon.Reload` | Refresh/reload |
| `Icon.Trash` | Delete/trash can |
| `Icon.Save` | Save disk |
| `Icon.Download` | Download arrow |
| `Icon.Copy` | Copy |
| `Icon.LikeDislike` | Thumbs |
| `Icon.Crop` | Crop tool |
| `Icon.Pin` | Pin/thumbtack |
| `Icon.ClearDrawing` | Clear drawing |
| `Icon.ExpandView` | Expand |
| `Icon.CollapseView` | Collapse |
| `Icon.Draw` | Draw/pencil |
| `Icon.Compose` | Compose |
| `Icon.Erase` | Eraser |
| `Icon.Message` | Message bubble |
| `Icon.Post` | Post |
| `Icon.AddDocument` | Add document |
| `Icon.AddLibrary` | Add library |
| `Icon.Import` | Import |
| `Icon.Export` | Export |
| `Icon.QuestionMark` | Question mark |
| `Icon.Help` | Help circle |
| `Icon.ThumbsDown` | Thumbs down outline |
| `Icon.ThumbsUp` | Thumbs up outline |
| `Icon.ThumbsDownFilled` | Thumbs down filled |
| `Icon.ThumbsUpFilled` | Thumbs up filled |
| `Icon.Undo` | Undo |
| `Icon.Redo` | Redo |

### Zoom & View
| Icon Name | Usage |
|-----------|-------|
| `Icon.ZoomIn` | Zoom in |
| `Icon.ZoomOut` | Zoom out |
| `Icon.OpenInNewWindow` | Open in new window |
| `Icon.Share` | Share |
| `Icon.Publish` | Publish |
| `Icon.Link` | Link |
| `Icon.Sync` | Sync |
| `Icon.View` | View/eye |
| `Icon.Hide` | Hide/eye slash |
| `Icon.Bookmark` | Bookmark outline |
| `Icon.BookmarkFilled` | Bookmark filled |
| `Icon.Reset` | Reset |
| `Icon.Blocked` | Blocked/no |
| `Icon.DockLeft` | Dock left |
| `Icon.DockRight` | Dock right |

### People
| Icon Name | Usage |
|-----------|-------|
| `Icon.AddUser` | Add user |
| `Icon.Cut` | Scissors/cut |
| `Icon.Paste` | Paste |
| `Icon.Leave` | Leave/exit |
| `Icon.People` | Multiple people |
| `Icon.Person` | Single person |
| `Icon.EmojiFrown` | Frown emoji |
| `Icon.EmojiSmile` | Smile emoji |
| `Icon.EmojiSad` | Sad emoji |
| `Icon.EmojiNeutral` | Neutral emoji |
| `Icon.EmojiHappy` | Happy emoji |

### Navigation
| Icon Name | Usage |
|-----------|-------|
| `Icon.Home` | Home |
| `Icon.Hamburger` | Hamburger menu |
| `Icon.Settings` **✓ compile-verified** | Settings gear |
| `Icon.More` | More (three dots) |
| `Icon.Waffle` | Waffle grid |
| `Icon.ChevronLeft` **✓ compile-verified** | Chevron left |
| `Icon.ChevronRight` **✓ compile-verified** | Chevron right |
| `Icon.Up` | Chevron up |
| `Icon.Down` | Chevron down |
| `Icon.Next` | Next circle |
| `Icon.Back` | Back circle |
| `Icon.ArrowDown` | Arrow down |
| `Icon.ArrowUp` | Arrow up |
| `Icon.ArrowLeft` **✓ compile-verified** | Arrow left |
| `Icon.ArrowRight` | Arrow right |

### Objects & Documents
| Icon Name | Usage |
|-----------|-------|
| `Icon.Camera` | Camera |
| `Icon.Document` | Document |
| `Icon.DocumentWithContent` **✓ compile-verified** | Document with content |
| `Icon.Folder` | Folder |
| `Icon.Journal` | Journal |
| `Icon.Food` | Food |
| `Icon.Transportation` | Transportation |
| `Icon.Airplane` | Airplane |
| `Icon.Bus` | Bus |
| `Icon.Cars` | Cars |
| `Icon.Money` | Money |
| `Icon.Currency` | Currency |
| `Icon.AddToCalendar` | Add to calendar |
| `Icon.CalendarBlank` **✓ compile-verified** | Calendar blank |
| `Icon.OfficeBuilding` | Office building |
| `Icon.PaperClip` | Paper clip / Attach |
| `Icon.Newspaper` | Newspaper |
| `Icon.Lock` | Lock |
| `Icon.Waypoint` | Waypoint |
| `Icon.Location` | Location pin |
| `Icon.PDFDocument` | PDF document |
| `Icon.Bell` | Bell |
| `Icon.ShoppingCart` | Shopping cart |
| `Icon.Phone` | Phone |
| `Icon.EndCall` | End call |
| `Icon.Mobile` | Mobile phone |
| `Icon.Laptop` | Laptop |
| `Icon.ComputerDesktop` | Computer desktop |
| `Icon.Devices` | Devices |
| `Icon.Controller` | Controller |
| `Icon.Tools` | Tools |
| `Icon.ToolsWrench` | Wrench |
| `Icon.Mail` | Mail envelope |
| `Icon.Send` | Send |
| `Icon.Clock` | Clock |
| `Icon.ListReminder` | List reminder |
| `Icon.LogJournal` | Log journal |
| `Icon.Note` | Note |
| `Icon.PictureFrame` | Picture frame |
| `Icon.Radar` | Radar |
| `Icon.Tablet` | Tablet |
| `Icon.Tag` | Tag |
| `Icon.CameraAperture` | Camera aperture |
| `Icon.ColorPicker` | Color picker |
| `Icon.DetailList` | Detail list |
| `Icon.DocumentSearch` | Document search |
| `Icon.ListScrollEmpty` | List scroll empty |
| `Icon.ListScrollWatchlist` | List scroll watchlist |
| `Icon.OptionsList` | Options list |
| `Icon.LightningBolt` | Lightning bolt |
| `Icon.HorizontalLine` | Horizontal line |
| `Icon.VerticalLine` | Vertical line |
| `Icon.Ribbon` | Ribbon |
| `Icon.Diamond` | Diamond |
| `Icon.Alarm` | Alarm clock |
| `Icon.History` | History |
| `Icon.Heart` | Heart |
| `Icon.Print` | Print |
| `Icon.Error` | Error |
| `Icon.Flag` | Flag |
| `Icon.Notebook` | Notebook |
| `Icon.Bug` | Bug |
| `Icon.Microphone` | Microphone |
| `Icon.Video` | Video |
| `Icon.Shop` | Shop |
| `Icon.Phonebook` | Phonebook |
| `Icon.Enhance` | Enhance |
| `Icon.Unlock` | Unlock |
| `Icon.Calculator` | Calculator |
| `Icon.Support` | Support |
| `Icon.Lightbulb` | Lightbulb |
| `Icon.Key` | Key |
| `Icon.Scan` | Scan |
| `Icon.Hospital` | Hospital |
| `Icon.Health` | Health |
| `Icon.Medical` | Medical stethoscope |
| `Icon.Manufacture` | Manufacture |
| `Icon.Train` | Train |
| `Icon.Globe` | Globe |
| `Icon.GlobeNo` | Globe no |
| `Icon.GlobeRefresh` | Globe refresh |
| `Icon.GlobeCheck` | Globe check |
| `Icon.GlobeWarning` | Globe warning |
| `Icon.GlobeError` | Globe error |
| `Icon.HalfFilledCircle` | Half filled circle |
| `Icon.Tray` | Tray |
| `Icon.Text` | Text |
| `Icon.Shirt` | Shirt |
| `Icon.Signal` | Signal |

### Data & Info
| Icon Name | Usage |
|-----------|-------|
| `Icon.Warning` | Warning triangle |
| `Icon.Information` | Information circle |
| `Icon.Database` | Database |
| `Icon.Weather` | Weather |
| `Icon.Hashtag` | Hashtag |
| `Icon.TrendingUpward` | Trending up |
| `Icon.Items` | Items grid |
| `Icon.Layers` | Layers |
| `Icon.Trending` | Trending line |
| `Icon.LineWeight` | Line weight |
| `Icon.ThreeDPrinting` | 3D Printing |

---

## When to Use Classic vs Modern Icons

| Scenario | Use |
|----------|-----|
| Clickable icon (needs OnSelect) | `Classic/Icon@2.5.0` |
| Display-only icon (no interaction) | `Icon@0.0.7` |
| Icon in gallery with click | `Classic/Icon@2.5.0` |
| Decorative/status indicator | `Icon@0.0.7` |

---

## Example: Interactive Icon

```yaml
- iconHamburger:
    Control: Classic/Icon@2.5.0
    Properties:
      Icon: =If(varMenuExpanded, Icon.Cancel, Icon.Hamburger)
      Color: =RGBA(255, 255, 255, 1)
      HoverColor: =RGBA(255, 255, 255, 0.8)
      PressedColor: =RGBA(255, 255, 255, 0.6)
      Height: =32
      Width: =32
      OnSelect: =Set(varMenuExpanded, !varMenuExpanded)
```

## Example: Display-Only Icon (Modern)

```yaml
- iconStatus:
    Control: Icon@0.0.7
    Properties:
      Icon: ="Check"
      IconColor: =RGBA(47, 163, 111, 1)
      IconStyle: ='Icon.IconStyle'.Filled
      Rotation: =0
      Height: =20
      Width: =20
```
