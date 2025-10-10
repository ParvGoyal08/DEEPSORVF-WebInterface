# Configuration file for Interactive Vessel Tracking System

# Timezone Configuration
TIMEZONE = 'Asia/Shanghai'  # China Standard Time (UTC+8)

# Flask Configuration
FLASK_CONFIG = {
    'DEBUG': True,
    'HOST': '0.0.0.0',
    'PORT': 5000,
    'TIMEZONE': TIMEZONE
}

# Video Processing Configuration
VIDEO_CONFIG = {
    'DEFAULT_FPS': 25,
    'DEFAULT_HEIGHT': 500,
    'TIMEZONE': TIMEZONE
}

# AIS Processing Configuration
AIS_CONFIG = {
    'TIMEZONE': TIMEZONE,
    'UPDATE_INTERVAL': 1000  # milliseconds
}
