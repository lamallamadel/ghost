# Extension Health Scoring System

## Overview

The Extension Health Scoring System provides automated quality assessment for Ghost CLI extensions, calculating a 0-100 health score based on multiple metrics.

## Scoring Components

### 1. Code Quality (25% weight)

Evaluates the technical quality of the extension code:

- **Test Coverage (40%)**: Parses coverage badges from README.md or coverage/coverage-summary.json
  - Supports CodeCov, Coveralls, and standard coverage badges
  - Falls back to 50% if no coverage data found
  
- **Documentation (30%)**: Checks for comprehensive documentation
  - README.md presence (40 points)
  - docs/ directory with files (40 points)
  - Detailed manifest description >50 chars (20 points)
  
- **Dependency Freshness (30%)**: Checks if dependencies are up-to-date
  - Queries npm registry for latest versions
  - Compares against package.json dependencies
  - Penalizes major version differences

### 2. Security (30% weight)

Assesses security posture and scan results:

- **Code Signing**: Verifies extension signature validity (-50 if invalid)
- **Security Scan Results**: 
  - Fails completely (score=0) if marked unsafe
  - Penalizes critical issues (-30 each)
  - Penalizes high severity issues (-15 each)
  - Penalizes medium severity issues (-5 each)

### 3. User Ratings (20% weight)

Based on marketplace ratings and reviews:

- Converts average rating (1-5) to 0-100 scale
- Applies confidence factor based on rating count
- Full confidence at 50+ ratings
- Blends with baseline score for low-rated extensions

### 4. Update Recency (15% weight)

Evaluates how recently the extension was updated:

- <30 days: 100 points
- 30-90 days: 85 points
- 90-180 days: 70 points
- 180-365 days: 50 points
- >365 days: 20 points

### 5. Maintainer Responsiveness (10% weight)

Analyzes GitHub repository activity:

- **Issue Management**: Low open issue ratio (+20 points if <10%)
- **Recent Activity**: Repository updated within 30-90 days
- **Community Engagement**: Has issues enabled and >10 stars

## Health Badge Levels

Health scores are mapped to visual badges:

- **Excellent** (80-100): Green (#10b981)
- **Good** (60-79): Blue (#3b82f6)
- **Fair** (40-59): Orange (#f59e0b)
- **Poor** (0-39): Red (#ef4444)

## API Integration

### REST API Endpoints

**GET /api/marketplace/extensions**
```json
{
  "extensions": [
    {
      "id": "example-extension",
      "name": "Example Extension",
      "healthScore": 85,
      "healthBadge": {
        "level": "excellent",
        "color": "#10b981",
        "label": "Excellent"
      }
    }
  ]
}
```

**GET /api/marketplace/extensions/:id**
```json
{
  "id": "example-extension",
  "healthScore": 85,
  "healthBadge": { ... },
  "healthBreakdown": {
    "codeQuality": 80,
    "security": 95,
    "userRatings": 88,
    "updateRecency": 100,
    "maintainerResponsiveness": 70
  }
}
```

## Caching

Health scores are cached for 1 hour (3600000ms) to avoid expensive recalculation on every request. Cache can be cleared:

```javascript
server.clearHealthScoreCache(extensionId); // Clear specific extension
server.clearHealthScoreCache(); // Clear all
```

## Desktop UI Integration

The ExtensionManagerTab displays health scores with:

- Color-coded badges next to extension names
- Numerical score in stats grid (0-100 scale)
- Shield icon for visual recognition
- Tooltip showing full score on hover

## Implementation Files

- `core/marketplace-backend/health-scorer.js` - Core scoring logic
- `core/marketplace-backend/server.js` - API integration
- `core/marketplace.js` - Client-side score estimation
- `desktop/src/tabs/ExtensionManagerTab.tsx` - UI rendering
- `desktop/src/ipc/types.ts` - TypeScript type definitions

## Future Enhancements

Potential improvements to the scoring system:

1. GitHub issue/PR response time metrics
2. Download velocity trends
3. Breaking change frequency analysis
4. Community contribution metrics
5. Security advisory tracking
6. Performance benchmarking data
