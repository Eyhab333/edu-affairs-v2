import 'package:flutter/material.dart';

class AppContentContainer extends StatelessWidget {
  const AppContentContainer({
    required this.child,
    super.key,
    this.maxWidth = 1100,
    this.alignment = Alignment.topCenter,
  });

  final Widget child;
  final double maxWidth;
  final AlignmentGeometry alignment;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: alignment,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: maxWidth),
        child: SizedBox(width: double.infinity, child: child),
      ),
    );
  }
}
