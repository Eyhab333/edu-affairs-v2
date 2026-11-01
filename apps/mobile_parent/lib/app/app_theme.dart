import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../shared/theme/app_tokens.dart';

ThemeData buildAppDarkTheme() {
  const scheme = ColorScheme.dark(
    primary: AppColors.primary,
    onPrimary: Color(0xFF052E16),
    primaryContainer: Color(0xFF14532D),
    onPrimaryContainer: AppColors.primarySoft,
    secondary: AppColors.gold,
    onSecondary: Color(0xFF451A03),
    secondaryContainer: Color(0xFF78350F),
    onSecondaryContainer: AppColors.goldSoft,
    error: Color(0xFFFB7185),
    onError: Color(0xFF4C0519),
    surface: Color(0xFF0F172A),
    onSurface: Color(0xFFF8FAFC),
    onSurfaceVariant: Color(0xFF94A3B8),
    outline: Color(0xFF475569),
    outlineVariant: Color(0xFF253248),
    shadow: Color(0xFF020617),
  );

  return _buildTheme(
    scheme: scheme,
    palette: const AppThemePalette(
      background: Color(0xFF020617),
      backgroundAlt: Color(0xFF08111F),
      glassSurface: Color(0xCC0F172A),
      glassBorder: Color(0x1FFFFFFF),
      mutedText: Color(0xFF94A3B8),
      gold: AppColors.gold,
      goldSoft: AppColors.goldSoft,
      greenGlow: Color(0x2422C55E),
      goldGlow: Color(0x1AF59E0B),
      deepShadow: Color(0x99020617),
    ),
  );
}

ThemeData buildAppLightTheme() {
  const scheme = ColorScheme.light(
    primary: AppColors.primaryDark,
    onPrimary: Colors.white,
    primaryContainer: Color(0xFFDCFCE7),
    onPrimaryContainer: Color(0xFF14532D),
    secondary: AppColors.goldDark,
    onSecondary: Colors.white,
    secondaryContainer: Color(0xFFFEF3C7),
    onSecondaryContainer: Color(0xFF78350F),
    error: Color(0xFFDC2626),
    onError: Colors.white,
    surface: Colors.white,
    onSurface: Color(0xFF0F172A),
    onSurfaceVariant: Color(0xFF64748B),
    outline: Color(0xFF94A3B8),
    outlineVariant: Color(0xFFDCE4EE),
    shadow: Color(0xFF0F172A),
  );

  return _buildTheme(
    scheme: scheme,
    palette: const AppThemePalette(
      background: Color(0xFFF8FAFC),
      backgroundAlt: Color(0xFFF1F5F9),
      glassSurface: Color(0xF2FFFFFF),
      glassBorder: Color(0x1F0F172A),
      mutedText: Color(0xFF64748B),
      gold: AppColors.goldDark,
      goldSoft: Color(0xFFFFF7D6),
      greenGlow: Color(0x1422C55E),
      goldGlow: Color(0x12F59E0B),
      deepShadow: Color(0x140F172A),
    ),
  );
}

ThemeData _buildTheme({
  required ColorScheme scheme,
  required AppThemePalette palette,
}) {
  final base = ThemeData(
    useMaterial3: true,
    brightness: scheme.brightness,
    colorScheme: scheme,
    scaffoldBackgroundColor: palette.background,
    extensions: [palette],
  );
  final textTheme = GoogleFonts.tajawalTextTheme(base.textTheme).apply(
    bodyColor: scheme.onSurface,
    displayColor: scheme.onSurface,
  );
  final borderRadius = BorderRadius.circular(AppRadius.lg);

  return base.copyWith(
    textTheme: textTheme,
    appBarTheme: AppBarTheme(
      centerTitle: false,
      elevation: 0,
      scrolledUnderElevation: 0,
      backgroundColor: Colors.transparent,
      foregroundColor: scheme.onSurface,
      surfaceTintColor: Colors.transparent,
      titleTextStyle: textTheme.titleLarge?.copyWith(
        color: scheme.onSurface,
        fontWeight: FontWeight.w900,
      ),
    ),
    cardTheme: CardThemeData(
      elevation: 0,
      color: palette.glassSurface,
      surfaceTintColor: Colors.transparent,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadius.xl),
        side: BorderSide(color: palette.glassBorder),
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      height: 68,
      elevation: 0,
      backgroundColor: palette.glassSurface,
      surfaceTintColor: Colors.transparent,
      indicatorColor: scheme.primary.withValues(alpha: 0.16),
      iconTheme: WidgetStateProperty.resolveWith((states) {
        return IconThemeData(
          color: states.contains(WidgetState.selected)
              ? scheme.primary
              : scheme.onSurfaceVariant,
        );
      }),
      labelTextStyle: WidgetStateProperty.resolveWith((states) {
        return textTheme.labelMedium?.copyWith(
          color: states.contains(WidgetState.selected)
              ? scheme.onSurface
              : scheme.onSurfaceVariant,
          fontWeight: states.contains(WidgetState.selected)
              ? FontWeight.w800
              : FontWeight.w600,
        );
      }),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: scheme.surfaceContainerHighest.withValues(alpha: 0.55),
      labelStyle: textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w700),
      border: OutlineInputBorder(borderRadius: borderRadius),
      enabledBorder: OutlineInputBorder(
        borderRadius: borderRadius,
        borderSide: BorderSide(color: scheme.outlineVariant),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: borderRadius,
        borderSide: BorderSide(color: scheme.primary, width: 1.5),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: borderRadius,
        borderSide: BorderSide(color: scheme.error),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: borderRadius,
        borderSide: BorderSide(color: scheme.error, width: 1.5),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size.fromHeight(50),
        textStyle: textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w900),
        shape: RoundedRectangleBorder(borderRadius: borderRadius),
      ),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        minimumSize: const Size.fromHeight(50),
        textStyle: textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w900),
        shape: RoundedRectangleBorder(borderRadius: borderRadius),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size.fromHeight(48),
        side: BorderSide(color: scheme.outlineVariant),
        textStyle: textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w800),
        shape: RoundedRectangleBorder(borderRadius: borderRadius),
      ),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: scheme.surfaceContainerHighest.withValues(alpha: 0.65),
      selectedColor: scheme.primary.withValues(alpha: 0.16),
      side: BorderSide(color: scheme.outlineVariant),
      labelStyle: textTheme.labelMedium?.copyWith(fontWeight: FontWeight.w700),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadius.pill),
      ),
    ),
    dividerTheme: DividerThemeData(color: scheme.outlineVariant),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: scheme.inverseSurface,
      shape: RoundedRectangleBorder(borderRadius: borderRadius),
      contentTextStyle: textTheme.bodyMedium?.copyWith(
        color: scheme.onInverseSurface,
        fontWeight: FontWeight.w700,
      ),
    ),
  );
}
