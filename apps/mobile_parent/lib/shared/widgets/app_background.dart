import 'package:flutter/material.dart';

import '../theme/app_tokens.dart';

class AppBackground extends StatelessWidget {
  const AppBackground({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final palette = context.appPalette;

    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [palette.backgroundAlt, palette.background],
        ),
      ),
      child: Stack(
        fit: StackFit.expand,
        children: [
          IgnorePointer(
            child: Align(
              alignment: Alignment.topRight,
              child: Container(
                width: 310,
                height: 260,
                decoration: BoxDecoration(
                  gradient: RadialGradient(
                    colors: [palette.greenGlow, Colors.transparent],
                  ),
                ),
              ),
            ),
          ),
          IgnorePointer(
            child: Align(
              alignment: Alignment.topLeft,
              child: Container(
                width: 260,
                height: 220,
                decoration: BoxDecoration(
                  gradient: RadialGradient(
                    colors: [palette.goldGlow, Colors.transparent],
                  ),
                ),
              ),
            ),
          ),
          child,
        ],
      ),
    );
  }
}
