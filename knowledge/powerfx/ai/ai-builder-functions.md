# AI Builder Functions for Power Apps Canvas Apps

## Overview

AI Builder provides seven prebuilt AI functions in Power Platform that are preconfigured and require no data collection, building, or training. These functions enable canvas apps to leverage AI capabilities like text classification, entity extraction, sentiment analysis, summarization, translation, and automated replies.

**Key Characteristics:**
- Ready-to-use AI capabilities (no training required)
- Work with canvas apps, AI Builder, and low-code plugins
- Behavior functions (cannot be used in Canvas data flow)
- Require Environment data source
- Consume AI Builder credits on execution

---

## Prerequisites

### Required Components

1. **Environment**: Microsoft Power Platform environment with a Dataverse database
   - Must be in a region where prompts are available (see [Feature availability by region](https://learn.microsoft.com/en-us/ai-builder/availability-region#prompts))

2. **Licensing**: One of the following:
   - Power Apps per user plan
   - Power Apps per app plan
   - Dynamics 365 license
   - Power Automate Premium plan

3. **AI Builder Add-on**: AI Builder capacity add-on or trial
   - See [AI Builder licensing](https://learn.microsoft.com/en-us/ai-builder/administer-licensing)

4. **Dataverse Database**: Must be installed on the environment
   - See [Create an environment with a database](https://learn.microsoft.com/en-us/power-platform/admin/create-environment#create-an-environment-with-a-database)

### Important Licensing Notes

- AI Builder is a **premium feature** - apps using AI functions are premium apps
- Functions consume AI Builder credits on each execution
- Testing in Power Apps Studio does **not** consume credits
- Starting November 1, 2025, environments in overage will block AI Builder features unless credits are available
- AI Builder credits seeded in Power Platform licenses will be removed in November 2026

---

## Setup Instructions

### 1. Add Environment Data Source

All AI functions exist in the **Environment** namespace and require adding the Environment data source:

1. In Power Apps Studio, select **Data** from the left navigation
2. Click **Add data**
3. Search for and select **Environment**
4. The Environment data source is now available

### 2. Function Invocation Pattern

AI functions in canvas apps follow these patterns:

**Syntax Pattern:**
```powerfx
Environment.AIFunctionName({ParameterName: value, ...})
```

**Return Pattern:**
- All functions return a **record** containing one or more columns
- Use dot notation to access specific return columns
- Store results in variables for reuse

**Example:**
```powerfx
// Store the full result record
Set(result, Environment.AISentiment({Text: TextInput1.Text}));

// Access the specific column
Label1.Text = result.AnalyzedSentiment
```

---

## AI Functions Reference

### 1. AIClassify

Classifies text into one or more provided categories using AI.

#### Syntax

```powerfx
Environment.AIClassify({
    Text: "text to classify",
    Categories: ["Category1", "Category2", ...]
})
```

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| Text | String | Yes | Text sentences to classify |
| Categories | Single-column table | Yes | Table of text categories to classify into |

#### Return Value

| Column | Type | Description |
|--------|------|-------------|
| Classification | String | The category name that best matches the input text |

#### Examples

**Basic Classification:**
```powerfx
// Classify customer inquiry into support categories
Set(
    category,
    Environment.AIClassify({
        Text: TextInput_CustomerMessage.Text,
        Categories: ["Problem", "Billing", "How To", "Licensing"]
    }).Classification
)

// Display result
Label_Category.Text = "Category: " & category
```

**Using with Table Data:**
```powerfx
// Classify email subject line
Set(
    emailCategory,
    Environment.AIClassify({
        Text: Gallery_Emails.Selected.Subject,
        Categories: ["Urgent", "Normal", "Low Priority", "Spam"]
    }).Classification
)
```

**Dynamic Categories from Data Source:**
```powerfx
// Classify using categories from a collection
Set(
    result,
    Environment.AIClassify({
        Text: TextInput1.Text,
        Categories: Categories_Collection.CategoryName
    }).Classification
)
```

#### Best Practices

- Provide 2-10 clear, distinct categories for best results
- Use descriptive category names that are mutually exclusive
- Categories should cover the expected range of inputs
- Store result in variable to avoid repeated API calls

---

### 2. AIExtract

Extracts specified entities such as registration numbers, phone numbers, names, addresses, dates, or other structured information from text.

#### Status Note

⚠️ **This function is still in development and might not operate properly in all scenarios.**

#### Syntax

```powerfx
Environment.AIExtract({
    Text: "text to extract from",
    Entity: "entity type to extract"
})
```

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| Text | String | Yes | Text to extract data from |
| Entity | String | Yes | Name of entity type to extract (e.g., "phone number", "email", "person name", "state", "registration number") |

#### Return Value

| Column | Type | Description |
|--------|------|-------------|
| ExtractedData | Table | Table of zero or more rows containing extracted entities |

#### Examples

**Extract State Names:**
```powerfx
// Extract state names from text
Set(
    states,
    Environment.AIExtract({
        Text: TextInput_Document.Text,
        Entity: "State"
    }).ExtractedData
)

// Display in gallery
Gallery_States.Items = states
```

**Extract Phone Numbers:**
```powerfx
// Extract phone numbers from customer message
Set(
    phoneNumbers,
    Environment.AIExtract({
        Text: TextInput_CustomerInfo.Text,
        Entity: "phone number"
    }).ExtractedData
)

// Show count of found numbers
Label_Count.Text = "Found " & CountRows(phoneNumbers) & " phone numbers"
```

**Extract Person Names:**
```powerfx
// Extract names from meeting notes
Set(
    attendees,
    Environment.AIExtract({
        Text: TextInput_Notes.Text,
        Entity: "person name"
    }).ExtractedData
)
```

**Extract Email Addresses:**
```powerfx
// Extract email addresses from text
Set(
    emails,
    Environment.AIExtract({
        Text: TextArea_Input.Text,
        Entity: "email"
    }).ExtractedData
)
```

#### Supported Entity Types

Common entity types include:
- "phone number"
- "email"
- "person name"
- "state"
- "registration number"
- "address"
- "date"
- "organization"

#### Best Practices

- Test with sample data to verify entity extraction accuracy
- Handle empty results (zero rows) gracefully
- Validate extracted data before using in business logic
- Consider using with error handling due to development status

---

### 3. AIReply

Drafts an AI-generated reply to provided text, useful for responding to customer reviews, emails, or messages.

#### Syntax

```powerfx
Environment.AIReply({
    Text: "text to respond to"
})
```

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| Text | String | Yes | Text to respond to (e.g., customer review, email, message) |

#### Return Value

| Column | Type | Description |
|--------|------|-------------|
| PreparedResponse | String | AI-generated response text |

#### Examples

**Reply to Customer Review:**
```powerfx
// Generate reply to customer feedback
Set(
    draftReply,
    Environment.AIReply({
        Text: Gallery_Reviews.Selected.ReviewText
    }).PreparedResponse
)

// Display in text box for review/editing
TextInput_Reply.Default = draftReply
```

**Reply to Email:**
```powerfx
// Draft response to email on button click
UpdateContext({
    suggestedReply: Environment.AIReply({
        Text: TextInput_EmailContent.Text
    }).PreparedResponse
})

// Show in label
Label_Response.Text = suggestedReply
```

**Reply to Support Ticket:**
```powerfx
// Generate response for support ticket
Set(
    ticketResponse,
    Environment.AIReply({
        Text: TextArea_TicketDetails.Text
    }).PreparedResponse
)

// Populate response field
TextInput_Response.Default = ticketResponse
```

**Batch Reply Generation:**
```powerfx
// Store reply for later use (on button click)
Button_GenerateReply.OnSelect =
    Set(varReply, Environment.AIReply({Text: currentMessage}).PreparedResponse);
    Navigate(Screen_ReviewReply)
```

#### Best Practices

- Review and edit AI-generated responses before sending
- Use as a draft/suggestion, not final automated response
- Provide sufficient context in the input text
- Consider adding company tone/style guidelines to input
- Store result to allow human review and modification

---

### 4. AISentiment

Detects the sentiment of text as Positive, Neutral, or Negative.

#### Syntax

```powerfx
Environment.AISentiment({
    Text: "text to analyze"
})
```

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| Text | String | Yes | Text to analyze for sentiment |

#### Return Value

| Column | Type | Description |
|--------|------|-------------|
| AnalyzedSentiment | String | One of three values: "Positive", "Neutral", or "Negative" |

#### Examples

**Basic Sentiment Analysis:**
```powerfx
// Analyze customer feedback sentiment
Set(
    sentiment,
    Environment.AISentiment({
        Text: TextInput_Feedback.Text
    }).AnalyzedSentiment
)

// Display result
Label_Sentiment.Text = "Sentiment: " & sentiment
```

**Color-Coded Sentiment Display:**
```powerfx
// Change icon color based on sentiment
Set(
    sentimentResult,
    Environment.AISentiment({
        Text: Gallery_Comments.Selected.CommentText
    }).AnalyzedSentiment
);

Icon_Sentiment.Color =
    Switch(
        sentimentResult,
        "Positive", Color.Green,
        "Negative", Color.Red,
        Color.Gray  // Neutral
    )
```

**Filter by Sentiment:**
```powerfx
// Analyze and store sentiment for filtering
ForAll(
    Reviews_Collection,
    Patch(
        Reviews_Collection,
        ThisRecord,
        {
            Sentiment: Environment.AISentiment({
                Text: ReviewText
            }).AnalyzedSentiment
        }
    )
);

// Filter to show only negative reviews
Gallery_NegativeReviews.Items =
    Filter(Reviews_Collection, Sentiment = "Negative")
```

**Sentiment Dashboard:**
```powerfx
// Count sentiments for dashboard
Set(
    positiveCount,
    CountRows(Filter(Reviews_Collection, Sentiment = "Positive"))
);

Set(
    negativeCount,
    CountRows(Filter(Reviews_Collection, Sentiment = "Negative"))
);

Set(
    neutralCount,
    CountRows(Filter(Reviews_Collection, Sentiment = "Neutral"))
)
```

**Conditional Logic Based on Sentiment:**
```powerfx
// Take action based on sentiment
Set(
    feedbackSentiment,
    Environment.AISentiment({
        Text: TextInput_CustomerFeedback.Text
    }).AnalyzedSentiment
);

If(
    feedbackSentiment = "Negative",
    Notify("This feedback will be escalated to management", NotificationType.Warning),
    feedbackSentiment = "Positive",
    Notify("Thank you for the positive feedback!", NotificationType.Success),
    Notify("Feedback recorded", NotificationType.Information)
)
```

#### Best Practices

- Use for analyzing customer feedback, reviews, and comments
- Combine with conditional logic for automated routing
- Store results to avoid repeated API calls
- Consider sentiment in prioritization workflows
- Use for dashboards and reporting on customer satisfaction

---

### 5. AISummarize

Summarizes provided text such as emails, documents, articles, or long-form content into concise text.

#### Syntax

```powerfx
Environment.AISummarize({
    Text: "text to summarize"
})
```

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| Text | String | Yes | Text to summarize (emails, documents, articles, etc.) |

#### Return Value

| Column | Type | Description |
|--------|------|-------------|
| SummarizedText | String | Concise summary of the input text |

#### Examples

**Summarize Email:**
```powerfx
// Summarize email content on button click
Set(
    emailSummary,
    Environment.AISummarize({
        Text: TextInput_EmailBody.Text
    }).SummarizedText
)

// Display summary
Label_Summary.Text = emailSummary
```

**Summarize Document:**
```powerfx
// Generate summary of uploaded document
UpdateContext({
    docSummary: Environment.AISummarize({
        Text: TextArea_Document.Text
    }).SummarizedText
})

// Show in a card
HTMLText_Summary.HtmlText =
    "<h3>Summary</h3><p>" & docSummary & "</p>"
```

**Summarize for Gallery Preview:**
```powerfx
// Add summary column to gallery items
ClearCollect(
    Articles_WithSummary,
    ForAll(
        Articles_Collection,
        {
            Title: Title,
            FullText: Content,
            Summary: Environment.AISummarize({
                Text: Content
            }).SummarizedText
        }
    )
);

Gallery_Articles.Items = Articles_WithSummary
```

**Conditional Summarization:**
```powerfx
// Summarize only if text is long
Set(
    textToDisplay,
    If(
        Len(Article_Text) > 500,
        Environment.AISummarize({
            Text: Article_Text
        }).SummarizedText,
        Article_Text
    )
)
```

**Meeting Notes Summary:**
```powerfx
// Summarize meeting notes and save to record
Patch(
    Meetings,
    LookUp(Meetings, ID = currentMeetingID),
    {
        NoteSummary: Environment.AISummarize({
            Text: TextArea_MeetingNotes.Text
        }).SummarizedText
    }
)
```

#### Best Practices

- Optimize credit usage by summarizing on user action (button click)
- Store summaries to avoid re-processing same text
- Use for email previews, document abstracts, and report summaries
- Consider text length limits of your environment
- Test summary quality with representative content

---

### 6. AITranslate

Translates text from any language (automatically detected) to a specified target language.

#### Syntax

```powerfx
Environment.AITranslate({
    Text: "text to translate",
    TargetLanguage: "language-code"
})
```

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| Text | String | Yes | Text to translate (source language auto-detected) |
| TargetLanguage | String | Yes | Target language code (e.g., "en", "fr", "es", "de") |

#### Return Value

| Column | Type | Description |
|--------|------|-------------|
| TranslatedText | String | Text translated to the target language |

#### Examples

**Basic Translation:**
```powerfx
// Translate to French
Set(
    frenchText,
    Environment.AITranslate({
        Text: TextInput_English.Text,
        TargetLanguage: "fr"
    }).TranslatedText
)

// Display translation
Label_French.Text = frenchText
```

**User-Selected Language:**
```powerfx
// Translate to language selected in dropdown
Set(
    translation,
    Environment.AITranslate({
        Text: TextInput_Source.Text,
        TargetLanguage: Dropdown_Language.Selected.Code
    }).TranslatedText
)

Label_Translation.Text = translation
```

**Multi-Language Support:**
```powerfx
// Create collection of target languages
ClearCollect(
    Languages,
    {Name: "Spanish", Code: "es"},
    {Name: "French", Code: "fr"},
    {Name: "German", Code: "de"},
    {Name: "Japanese", Code: "ja"},
    {Name: "Chinese (Simplified)", Code: "zh"}
);

// Populate dropdown
Dropdown_TargetLanguage.Items = Languages;

// Translate button action
Button_Translate.OnSelect =
    Set(
        translatedOutput,
        Environment.AITranslate({
            Text: TextInput_Original.Text,
            TargetLanguage: Dropdown_TargetLanguage.Selected.Code
        }).TranslatedText
    )
```

**Translate Customer Messages:**
```powerfx
// Translate customer message to English for support team
Set(
    englishMessage,
    Environment.AITranslate({
        Text: Gallery_Messages.Selected.MessageText,
        TargetLanguage: "en"
    }).TranslatedText
)
```

**Translate and Save:**
```powerfx
// Translate product description and save to data source
Patch(
    Products,
    LookUp(Products, ID = currentProductID),
    {
        Description_Spanish: Environment.AITranslate({
            Text: Description_English,
            TargetLanguage: "es"
        }).TranslatedText,
        Description_French: Environment.AITranslate({
            Text: Description_English,
            TargetLanguage: "fr"
        }).TranslatedText
    }
)
```

**Batch Translation:**
```powerfx
// Translate multiple items (use sparingly due to credit consumption)
ClearCollect(
    TranslatedProducts,
    ForAll(
        Products_Collection,
        {
            ID: ID,
            Name_Original: Name,
            Name_Spanish: Environment.AITranslate({
                Text: Name,
                TargetLanguage: "es"
            }).TranslatedText
        }
    )
)
```

#### Supported Languages

See the complete list of supported languages in the [Azure Translator language support documentation](https://learn.microsoft.com/en-us/azure/ai-services/translator/language-support).

**Common Language Codes:**
- `"en"` - English
- `"es"` - Spanish
- `"fr"` - French
- `"de"` - German
- `"it"` - Italian
- `"pt"` - Portuguese
- `"ja"` - Japanese
- `"zh"` - Chinese (Simplified)
- `"ko"` - Korean
- `"ar"` - Arabic
- `"ru"` - Russian
- `"hi"` - Hindi

#### Best Practices

- Source language is automatically detected
- Use standard ISO 639-1 language codes
- Test translation quality for your specific use case
- Consider caching translations to reduce credit consumption
- Provide context when possible for better accuracy
- Use for customer-facing multilingual scenarios

---

## Advanced Usage Patterns

### Pattern 1: Store Results in Variables

Avoid repeated API calls by storing results in global or context variables:

```powerfx
// Global variable (accessible across screens)
Set(
    globalSentiment,
    Environment.AISentiment({Text: ReviewText}).AnalyzedSentiment
)

// Context variable (screen-specific)
UpdateContext({
    localSummary: Environment.AISummarize({Text: EmailBody}).SummarizedText
})
```

### Pattern 2: Chaining AI Functions

Combine multiple AI functions for complex workflows:

```powerfx
// Translate then summarize
Set(
    translatedText,
    Environment.AITranslate({
        Text: originalText,
        TargetLanguage: "en"
    }).TranslatedText
);

Set(
    summary,
    Environment.AISummarize({
        Text: translatedText
    }).SummarizedText
)
```

### Pattern 3: Button-Triggered Analysis

Optimize credit usage by triggering AI on user action:

```powerfx
Button_Analyze.OnSelect =
    Set(varSentiment, Environment.AISentiment({Text: TextInput1.Text}).AnalyzedSentiment);
    Set(varSummary, Environment.AISummarize({Text: TextInput1.Text}).SummarizedText);
    Set(varCategory, Environment.AIClassify({Text: TextInput1.Text, Categories: Categories}).Classification)
```

### Pattern 4: Conditional Processing

Use AI functions conditionally to manage costs:

```powerfx
// Only analyze if text length exceeds threshold
Set(
    analysis,
    If(
        Len(TextInput1.Text) > 100,
        Environment.AISentiment({Text: TextInput1.Text}).AnalyzedSentiment,
        "N/A"
    )
)
```

### Pattern 5: Batch Processing with ForAll

Process multiple records (use carefully due to credit consumption):

```powerfx
// Analyze sentiment for all reviews
ForAll(
    Reviews_Collection,
    Patch(
        Reviews_Collection,
        ThisRecord,
        {
            Sentiment: Environment.AISentiment({
                Text: ReviewText
            }).AnalyzedSentiment
        }
    )
)
```

### Pattern 6: Error Handling

Implement error handling for robust apps:

```powerfx
// Use IfError to handle failures
Set(
    result,
    IfError(
        Environment.AIClassify({
            Text: TextInput1.Text,
            Categories: ["A", "B", "C"]
        }).Classification,
        "Error: " & FirstError.Message
    )
)
```

---

## Credit Management Best Practices

### Optimization Strategies

1. **Trigger on User Action**: Use button OnSelect instead of TextInput OnChange
   ```powerfx
   // GOOD: Button triggered
   Button.OnSelect = Set(result, Environment.AISummarize({Text: input}).SummarizedText)

   // AVOID: Triggered on every keystroke
   TextInput.OnChange = Set(result, Environment.AISummarize({Text: Self.Text}).SummarizedText)
   ```

2. **Cache Results**: Store AI results in variables or collections
   ```powerfx
   // Store result once
   Set(cachedSummary, Environment.AISummarize({Text: document}).SummarizedText);

   // Reuse cached result
   Label1.Text = cachedSummary;
   Label2.Text = cachedSummary
   ```

3. **Conditional Execution**: Only call AI when necessary
   ```powerfx
   If(
       IsBlank(varSummary),
       Set(varSummary, Environment.AISummarize({Text: doc}).SummarizedText)
   )
   ```

4. **Limit Batch Processing**: Avoid ForAll loops with AI functions on large datasets
   ```powerfx
   // AVOID on large datasets (high credit consumption)
   ForAll(AllRecords, Environment.AISentiment({Text: Text}).AnalyzedSentiment)

   // BETTER: Process on-demand or in smaller batches
   ```

5. **Testing**: Test formulas in Power Apps Studio (doesn't consume credits)

### Credit Consumption

- Credits consumed based on input tokens, output tokens, and underlying AI model
- Testing in Power Apps Studio does **not** consume credits
- Production runs in published apps **do** consume credits
- Monitor credit usage in Power Platform Admin Center

---

## Troubleshooting

### Common Issues

#### Issue: "Environment data source not found"

**Solution**: Add the Environment data source:
1. Go to Data panel
2. Click "Add data"
3. Search for "Environment"
4. Select and add

#### Issue: "Function is undefined or not available"

**Solution**: Ensure you're using the Environment namespace:
```powerfx
// WRONG
AISummarize({Text: input})

// CORRECT
Environment.AISummarize({Text: input})
```

#### Issue: "Insufficient AI Builder credits"

**Solution**:
- Check credit allocation in Power Platform Admin Center
- Purchase AI Builder capacity add-on
- Contact admin to allocate credits to environment

#### Issue: "Function not available in this region"

**Solution**: Verify your environment is in a supported region
- Check [Feature availability by region](https://learn.microsoft.com/en-us/ai-builder/availability-region#prompts)
- Create new environment in supported region if needed

#### Issue: Parameters not recognized

**Solution**: Ensure parameters are passed as named record columns:
```powerfx
// WRONG
Environment.AISentiment("Hello world")

// CORRECT
Environment.AISentiment({Text: "Hello world"})
```

---

## Limitations and Considerations

### Technical Limitations

1. **Behavior Functions**: Cannot be used in data flow formulas (e.g., calculated columns in galleries)
2. **Delegation**: AI functions do not support delegation
3. **Return Types**: Always return records, not direct values
4. **Async Nature**: Functions may take time to process; consider loading indicators
5. **Text Length**: May have limits on input text length (varies by function)

### Business Considerations

1. **Credit Management**: Each execution consumes AI Builder credits
2. **Regional Availability**: Not available in all regions
3. **Licensing**: Requires premium licenses and AI Builder capacity
4. **Data Privacy**: Ensure compliance when processing sensitive data
5. **Quality**: AI results may vary; implement human review for critical decisions

### Development Status

- **AIExtract**: Still in development, may not operate properly
- Other functions are generally available but continue to evolve

---

## Related Resources

### Official Documentation

- [AI Functions Reference](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-ai) - Complete Power Fx function reference
- [Use AI Builder models in Power Apps](https://learn.microsoft.com/en-us/ai-builder/powerfx-in-powerapps) - Integration guide
- [AI Builder Prerequisites](https://learn.microsoft.com/en-us/ai-builder/prebuilt-prompts#prerequisites) - Requirements and setup
- [AI Builder Licensing](https://learn.microsoft.com/en-us/ai-builder/administer-licensing) - License and credit management
- [Feature Availability by Region](https://learn.microsoft.com/en-us/ai-builder/availability-region#prompts) - Regional availability
- [Azure Translator Language Support](https://learn.microsoft.com/en-us/azure/ai-services/translator/language-support) - Supported languages for AITranslate

### Additional Resources

- [AI Builder Credit Management](https://learn.microsoft.com/en-us/ai-builder/credit-management) - Understanding credit consumption
- [Create Environment with Database](https://learn.microsoft.com/en-us/power-platform/admin/create-environment#create-an-environment-with-a-database) - Environment setup
- [Power Fx Formula Reference](https://learn.microsoft.com/en-us/power-platform/power-fx/formula-reference-canvas-apps) - Complete formula reference

---

## Document Information

**Last Updated**: 2025-12-12
**Power Fx Version**: Current (as of December 2025)
**Documentation Source**: Microsoft Learn Official Documentation

**Source URLs**:
- https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-ai
- https://learn.microsoft.com/en-us/ai-builder/powerfx-in-powerapps
- https://learn.microsoft.com/en-us/ai-builder/prebuilt-prompts
- https://learn.microsoft.com/en-us/ai-builder/administer-licensing
- https://learn.microsoft.com/en-us/azure/ai-services/translator/language-support

---

## Quick Reference

| Function | Purpose | Key Parameters | Return Column |
|----------|---------|----------------|---------------|
| AIClassify | Classify text into categories | Text, Categories | Classification |
| AIExtract | Extract entities from text | Text, Entity | ExtractedData |
| AIReply | Generate AI reply | Text | PreparedResponse |
| AISentiment | Detect sentiment | Text | AnalyzedSentiment |
| AISummarize | Summarize text | Text | SummarizedText |
| AITranslate | Translate text | Text, TargetLanguage | TranslatedText |

**All functions require**:
- Environment data source added to app
- Environment. namespace prefix
- Parameters as named record columns
- AI Builder license and credits

## Sources

- [Feature Availability by Region](https://learn.microsoft.com/en-us/ai-builder/availability-region#prompts)
- [AI Builder Licensing](https://learn.microsoft.com/en-us/ai-builder/administer-licensing)
- [Create Environment with Database](https://learn.microsoft.com/en-us/power-platform/admin/create-environment#create-an-environment-with-a-database)
- [Azure Translator Language Support](https://learn.microsoft.com/en-us/azure/ai-services/translator/language-support)
- [AI Functions Reference](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-ai)
- [Use AI Builder models in Power Apps](https://learn.microsoft.com/en-us/ai-builder/powerfx-in-powerapps)
- [AI Builder Prerequisites](https://learn.microsoft.com/en-us/ai-builder/prebuilt-prompts#prerequisites)
- [AI Builder Credit Management](https://learn.microsoft.com/en-us/ai-builder/credit-management)
- [Power Fx Formula Reference](https://learn.microsoft.com/en-us/power-platform/power-fx/formula-reference-canvas-apps)
- [Microsoft Learn: prebuilt-prompts](https://learn.microsoft.com/en-us/ai-builder/prebuilt-prompts)
