# Download Function

Download files from web URLs to the local device.

---

## Syntax

```powerfx
Download( Address )
```

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| Address | Yes | URL of the file to download |

## Return Value

- **Windows only**: Returns local file path as text
- **Other platforms**: No return value

---

## Platform Behavior

| Platform | Behavior |
|----------|----------|
| Windows (native) | Prompts for save location, returns path |
| Android/iOS | Prompts for save location |
| Web browser | Depends on browser settings and file type |
| Web (supported types) | Opens in new tab (images, PDFs, videos) |

---

## Basic Example

```powerfx
// Download a file
Download( "https://example.com/document.pdf" )
```

---

## Common Patterns

### Download Button

```powerfx
// Button OnSelect
Download( varFileURL )
```

### Download from Data Source

```powerfx
// Download selected item's attachment
Download( Gallery1.Selected.AttachmentURL )
```

### Download Report

```powerfx
Download( "https://myserver.com/reports/quarterly.pdf" )
```

### Download with Dynamic URL

```powerfx
Download(
    "https://api.example.com/export/" &
    Text( varReportID ) &
    ".xlsx"
)
```

---

## Windows-Specific: Using Return Value

On Windows only, Download returns the local file path:

```powerfx
Set(
    varLocalPath,
    Download( "https://example.com/file.pdf" )
)
// varLocalPath = "C:\Users\...\Downloads\file.pdf"
```

---

## Important Limitations

### Authentication Not Supported

Power Apps cannot authenticate download requests:

```powerfx
// FAILS on mobile: SharePoint requires authentication
Download( "https://mycompany.sharepoint.com/doc.pdf" )

// WORKS in web browser: Uses cached credentials
Download( "https://mycompany.sharepoint.com/doc.pdf" )
```

### Browser Behavior

- File type determines behavior (open vs download)
- Pop-up blockers may interfere
- Permission dialogs may appear

### Behavior Formula Only

```powerfx
// OK: In OnSelect, OnChange, etc.
Download( url )

// ERROR: Cannot use in calculated properties
// Items = Download( url )  // Won't work
```

---

## Handling Different File Types

### Documents (PDF, Word, Excel)

```powerfx
// Usually triggers download dialog
Download( "https://example.com/report.pdf" )
Download( "https://example.com/data.xlsx" )
```

### Images

```powerfx
// May open in browser tab instead of downloading
Download( "https://example.com/image.png" )
```

### Workaround for In-Browser Files

For files that open in browser, consider:

1. Server-side: Set `Content-Disposition: attachment` header
2. Use a proxy service that forces download

---

## Download vs Launch

| Download | Launch |
|----------|--------|
| Downloads file to device | Opens URL in browser |
| For saving files locally | For viewing content |
| Prompts save dialog | Opens new tab/window |

```powerfx
// Download the file
Download( "https://example.com/doc.pdf" )

// Open/view the file in browser
Launch( "https://example.com/doc.pdf" )
```

---

## Error Handling

```powerfx
IfError(
    Download( varFileURL ),
    Notify( "Download failed. Check your connection.", NotificationType.Error )
)
```

---

## Common Use Cases

| Use Case | Example |
|----------|---------|
| Export data | `Download( "https://api.example.com/export?id=" & ID )` |
| Get attachment | `Download( Record.AttachmentURL )` |
| Download report | `Download( varReportURL )` |
| Save document | `Download( "https://storage.example.com/doc.pdf" )` |

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Nothing happens | Check pop-up blocker settings |
| Opens in browser instead | Server needs Content-Disposition header |
| Authentication error | Use browser (has cached credentials) or alternative approach |
| Mobile fails | Check if resource requires authentication |

---

## Common Mistakes

```powerfx
// BAD: Expecting return value on non-Windows
Set( path, Download( url ) )  // Returns blank on mobile/web

// GOOD: Just call Download for side effect
Download( url )

// BAD: Using for authenticated resources on mobile
Download( "https://sharepoint.com/sites/team/doc.pdf" )

// GOOD: Consider alternative for authenticated content
// (e.g., embed in app, use Power Automate)

// BAD: Using in calculated property
Image.Image = Download( url )

// GOOD: Use in behavior property
Button.OnSelect = Download( url )
```

---

## Sources

- [Microsoft Learn: Download function](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-download)
