import 'package:flutter/material.dart';

class AppColors {
  const AppColors._();

  static const primary = Color(0xFF22C55E);
  static const primaryDark = Color(0xFF16A34A);
  static const primarySoft = Color(0xFFBBF7D0);
  static const gold = Color(0xFFF59E0B);
  static const goldDark = Color(0xFFD97706);
  static const goldSoft = Color(0xFFFDE68A);

  static const background = Color(0xFF050816);
  static const surface = Color(0xFF0F172A);
  static const border = Color(0xFF334155);

  static const text = Color(0xFF0F172A);
  static const mutedText = Color(0xFF64748B);
  static const softText = Color(0xFF94A3B8);

  static const danger = Color(0xFFDC2626);
  static const dangerSoft = Color(0x26DC2626);

  static const soft = Color(0x1822C55E);
}

@immutable
class AppThemePalette extends ThemeExtension<AppThemePalette> {
  const AppThemePalette({
    required this.background,
    required this.backgroundAlt,
    required this.glassSurface,
    required this.glassBorder,
    required this.mutedText,
    required this.gold,
    required this.goldSoft,
    required this.greenGlow,
    required this.goldGlow,
    required this.deepShadow,
  });

  final Color background;
  final Color backgroundAlt;
  final Color glassSurface;
  final Color glassBorder;
  final Color mutedText;
  final Color gold;
  final Color goldSoft;
  final Color greenGlow;
  final Color goldGlow;
  final Color deepShadow;

  @override
  AppThemePalette copyWith({
    Color? background,
    Color? backgroundAlt,
    Color? glassSurface,
    Color? glassBorder,
    Color? mutedText,
    Color? gold,
    Color? goldSoft,
    Color? greenGlow,
    Color? goldGlow,
    Color? deepShadow,
  }) {
    return AppThemePalette(
      background: background ?? this.background,
      backgroundAlt: backgroundAlt ?? this.backgroundAlt,
      glassSurface: glassSurface ?? this.glassSurface,
      glassBorder: glassBorder ?? this.glassBorder,
      mutedText: mutedText ?? this.mutedText,
      gold: gold ?? this.gold,
      goldSoft: goldSoft ?? this.goldSoft,
      greenGlow: greenGlow ?? this.greenGlow,
      goldGlow: goldGlow ?? this.goldGlow,
      deepShadow: deepShadow ?? this.deepShadow,
    );
  }

  @override
  AppThemePalette lerp(
    covariant AppThemePalette? other,
    double t,
  ) {
    if (other == null) return this;
    return AppThemePalette(
      background: Color.lerp(background, other.background, t)!,
      backgroundAlt: Color.lerp(backgroundAlt, other.backgroundAlt, t)!,
      glassSurface: Color.lerp(glassSurface, other.glassSurface, t)!,
      glassBorder: Color.lerp(glassBorder, other.glassBorder, t)!,
      mutedText: Color.lerp(mutedText, other.mutedText, t)!,
      gold: Color.lerp(gold, other.gold, t)!,
      goldSoft: Color.lerp(goldSoft, other.goldSoft, t)!,
      greenGlow: Color.lerp(greenGlow, other.greenGlow, t)!,
      goldGlow: Color.lerp(goldGlow, other.goldGlow, t)!,
      deepShadow: Color.lerp(deepShadow, other.deepShadow, t)!,
    );
  }
}

extension AppThemePaletteContext on BuildContext {
  AppThemePalette get appPalette =>
      Theme.of(this).extension<AppThemePalette>()!;
}

class AppSpacing {
  const AppSpacing._();

  static const xs = 6.0;
  static const sm = 10.0;
  static const md = 14.0;
  static const lg = 18.0;
  static const xl = 22.0;
  static const xxl = 28.0;
}

class AppRadius {
  const AppRadius._();

  static const sm = 12.0;
  static const md = 16.0;
  static const lg = 20.0;
  static const xl = 26.0;
  static const pill = 999.0;
}
