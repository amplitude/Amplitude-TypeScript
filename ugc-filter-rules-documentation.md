# UGC Filter Rules Documentation

## Overview

The `ugcFilterRules` feature in Amplitude's Session Replay SDK enables you to detect and sanitize sensitive user-generated content (UGC) in URLs before it is recorded in session replays and heatmaps. This helps ensure that personally identifiable or sensitive information is not inadvertently captured.

## What are UGC Filter Rules?

UGC Filter Rules are configuration objects that define patterns to match URLs and specify replacement text. When the SDK captures URLs during session replay and heatmap recording, it applies these rules to sanitize or anonymize sensitive information such as:

- User IDs
- Comapny names
- Sensitive query parameters
- Dynamic path segments containing private data

## Configuration

UGC Filter Rules are configured as part of the `interactionConfig` when initializing the Session Replay SDK:

```javascript
import { sessionReplay } from '@amplitude/session-replay-browser';

sessionReplay.init('YOUR_API_KEY', {
    // ...
    // Other Configs
    // ...
  interactionConfig: {
    enabled: true,
    ugcFilterRules: [
      {
        selector: 'https://example.com/user/*/profile',
        replacement: 'https://example.com/user/USER_ID/profile'
      },
      {
        selector: 'https://example.com/api/token=*',
        replacement: 'https://example.com/api/token=REDACTED'
      }
    ]
  }
});
```

## Rule Structure

Each UGC Filter Rule is an object with two required properties:

```typescript
type UGCFilterRule = {
  selector: string;    // Glob pattern to match URLs
  replacement: string; // Text to replace the matched URL
};
```

### Properties

- **`selector`**: A glob pattern string that matches URLs. Supports `*` (any characters). Multiple wildcards can be used in domains and paths.
- **`replacement`**: The replacement text that will be used when the selector pattern matches a URL.

### Quick Examples
- `https://*.domain.com/*` - matches any subdomain and any path
- `https://site.com/*/*` - matches two path segments  
- `https://api.com/*/data/*` - matches specific patterns with wildcards

## Glob Pattern Syntax

The `selector` field uses basic glob patterns for URL matching. The current implementation supports:

| Pattern | Description | Example |
|---------|-------------|---------|
| `*` | Matches any sequence of characters | `https://example.com/*` matches `https://example.com/anything` |

**Key Features:**
- **Multiple wildcards**: You can use multiple `*` in a single pattern (e.g., `https://*.domain.com/*/*`)
- **Domain wildcards**: `*` works in domain names (e.g., `*.projecttool.com`)  
- **Path wildcards**: Multiple `*` can be used in URL paths (e.g., `/projects/*/boards/*`)

**Note**: Advanced glob features like `**`, `[abc]`, `{option1,option2}`, and others are not currently supported.

## Examples

### Project Management Tool URL Filtering

Remove organization names and sensitive identifiers from project management URLs:

```javascript
// Filter ticket URLs
{
  selector: "https://*.projecttool.com/browse/*",
  replacement: "https://ORG_NAME.projecttool.com/browse/TICKET_NUMBER"
}

// Filter project list URLs  
{
  selector: "https://*.projecttool.com/software/projects/*/list*",
  replacement: "https://ORG_NAME.projecttool.com/software/projects/PROJECT_NAME/list"
}

// Filter board URLs
{
  selector: "https://*.projecttool.com/software/projects/*/boards/*",
  replacement: "https://ORG_NAME.projecttool.com/software/projects/boards/BOARD_ID"
}

// Filter wiki pages
{
  selector: "https://*.projecttool.com/wiki/spaces/*/pages/*",
  replacement: "https://ORG_NAME.projecttool.com/wiki/spaces/SPACE_NAME/pages/PAGE_NAME"
}
```

### Code Repository Filtering

Remove repository details and sensitive paths:

```javascript
// Filter repository file browser with branch and file paths
{
  selector: "https://codehost.com/*/*/tree/*/*",
  replacement: "https://codehost.com/USER/REPO/tree/BRANCH/FILES"
}

// Filter repository branch view
{
  selector: "https://codehost.com/*/*/tree/*",
  replacement: "https://codehost.com/USER/REPO/tree/BRANCH"
}
```

### Basic User ID Filtering

Remove user IDs from profile URLs:

```javascript
{
  selector: 'https://myapp.com/user/*/profile',
  replacement: 'https://myapp.com/user/USER_ID/profile'
}
```

**Before**: `https://myapp.com/user/12345/profile`  
**After**: `https://myapp.com/user/USER_ID/profile`

### Query Parameter Sanitization

Remove sensitive query parameters:

```javascript
{
  selector: 'https://myapp.com/dashboard?token=*',
  replacement: 'https://myapp.com/dashboard?token=REDACTED'
}
```

**Before**: `https://myapp.com/dashboard?token=abc123xyz`  
**After**: `https://myapp.com/dashboard?token=REDACTED`

### Multiple Path Segments

Filter complex URLs with multiple dynamic segments:

```javascript
{
  selector: 'https://api.example.com/users/*/documents/*/*',
  replacement: 'https://api.example.com/users/USER_ID/documents/CATEGORY/DOCUMENT_ID'
}
```

**Before**: `https://api.example.com/users/john123/documents/private/contract-2023.pdf`  
**After**: `https://api.example.com/users/USER_ID/documents/CATEGORY/DOCUMENT_ID`

### Email Addresses in URLs

Remove email addresses from URL paths:

```javascript
{
  selector: 'https://myapp.com/user/*/settings',
  replacement: 'https://myapp.com/user/EMAIL_ADDRESS/settings'
}
```

**Before**: `https://myapp.com/user/john.doe@company.com/settings`  
**After**: `https://myapp.com/user/EMAIL_ADDRESS/settings`

## Advanced Usage

### Multiple Rules with Precedence

Rules are applied in order, and the **first matching rule wins**:

```javascript
ugcFilterRules: [
  // More specific rule - will match first
  {
    selector: 'https://example.com/user/*/profile/settings',
    replacement: 'https://example.com/user/USER_ID/profile/settings'
  },
  // Less specific rule - will only match if first rule doesn't
  {
    selector: 'https://example.com/user/*/*',
    replacement: 'https://example.com/user/USER_ID/ACTION'
  }
]
```

### Complete Configuration Example

```javascript
import { sessionReplay } from '@amplitude/session-replay-browser';

sessionReplay.init('YOUR_API_KEY', {
  interactionConfig: {
    enabled: true,
    ugcFilterRules: [
      // Filter project management tool URLs
      {
        selector: "https://*.projecttool.com/browse/*",
        replacement: "https://ORG_NAME.projecttool.com/browse/TICKET_NUMBER"
      },
      {
        selector: "https://*.projecttool.com/software/projects/*/boards/*",
        replacement: "https://ORG_NAME.projecttool.com/software/projects/PROJECT_NAME/boards/BOARD_ID"
      },
      
      // Filter code repository URLs
      {
        selector: "https://codehost.com/*/*/tree/*/*",
        replacement: "https://codehost.com/USER/REPO/tree/BRANCH/FILES"
      },
      {
        selector: "https://codehost.com/*/*/tree/*",
        replacement: "https://codehost.com/USER/REPO/tree/BRANCH"
      },
      
      // Filter internal application URLs
      {
        selector: 'https://myapp.com/user/*/profile',
        replacement: 'https://myapp.com/user/USER_ID/profile'
      },
      {
        selector: 'https://api.myapp.com/*?token=*',
        replacement: 'https://api.myapp.com/ENDPOINT?token=REDACTED'
      },
      
      // Filter admin URLs completely
      {
        selector: 'https://myapp.com/admin/*',
        replacement: 'https://myapp.com/admin/ADMIN_SECTION'
      }
    ]
  }
});
```

## Error Handling and Validation

The SDK validates UGC Filter Rules during initialization:

### Validation Rules

1. **Type Validation**: Both `selector` and `replacement` must be strings
2. **URL Format Validation**: The `selector` must be a valid URL pattern (start with `/` or `http://`/`https://`)
3. **Non-empty**: Selectors cannot be empty or whitespace-only

### Error Examples

```javascript
// ❌ Invalid - non-string selector
{
  selector: 123,
  replacement: 'replacement'
}
// Error: ugcFilterRules must be an array of objects with selector and replacement properties

// ❌ Invalid - non-string replacement
{
  selector: 'https://example.com/*',
  replacement: 456
}
// Error: ugcFilterRules must be an array of objects with selector and replacement properties

// ❌ Invalid - selector doesn't start with / or http(s)://
{
  selector: 'example.com/path',
  replacement: 'replacement'
}
// Error: ugcFilterRules must be an array of objects with valid globs

// ❌ Invalid - empty selector
{
  selector: '',
  replacement: 'replacement'
}
// Error: ugcFilterRules must be an array of objects with valid globs

// ❌ Invalid - whitespace-only selector
{
  selector: '   ',
  replacement: 'replacement'
}
// Error: ugcFilterRules must be an array of objects with valid globs
```

## Note

### 1. Order Rules by Specificity
Place more specific patterns before general ones:

```javascript
ugcFilterRules: [
  // More specific patterns first
  { 
    selector: 'https://codehost.com/*/*/tree/*/*', 
    replacement: 'https://codehost.com/USER/REPO/tree/BRANCH/FILES' 
  },
  // Less specific patterns later
  { 
    selector: 'https://codehost.com/*/*/tree/*', 
    replacement: 'https://codehost.com/USER/REPO/tree/BRANCH' 
  },
  // Most general patterns last
  { 
    selector: 'https://codehost.com/*/*', 
    replacement: 'https://codehost.com/USER/REPO' 
  }
]
```

### 2. Use Descriptive Replacements
Make replacements clear and meaningful:

```javascript
// ✅ Good - descriptive
{ 
  selector: 'https://*.projecttool.com/browse/*', 
  replacement: 'https://ORG_NAME.projecttool.com/browse/TICKET_NUMBER' 
}

// ❌ Avoid - unclear
{ 
  selector: 'https://*.projecttool.com/browse/*', 
  replacement: 'https://XXX.projecttool.com/browse/XXX' 
}
```

### 3. Test Your Patterns in a development environment first
Validate your glob patterns match expected URLs:

```javascript
// Test with various URL formats
const testUrls = [
  'https://mycompany.projecttool.com/browse/PROJ-123',
  'https://codehost.com/username/repository/tree/main/src/components',
  'https://myapp.com/user/john.doe@email.com/profile'
];
```

## Troubleshooting

### Common Issues

1. **Rules Not Applied**: Ensure `interactionConfig.enabled` is `true`
2. **Pattern Not Matching**: Remember that only `*` patterns are supported
3. **Wrong Order**: Check that specific rules come before general ones
4. **Invalid Patterns**: Verify that selectors only use supported glob syntax (`*`)

## Limitations

- Rules are applied to full URLs, not individual URL components
- **Limited glob pattern support**: Only `*` (any characters) is supported
- Advanced glob features like `**`, `[abc]`, `{option1,option2}`, ranges, negation, etc. are not supported
- Rules cannot modify URL structure, only replace entire URLs


**Important**: The current implementation uses a simple glob-to-regex conversion. While it supports multiple wildcards and domain patterns, it doesn't support advanced glob features. This covers most common URL filtering scenarios effectively.