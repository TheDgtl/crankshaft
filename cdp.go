package main

import (
	"context"
	"fmt"
	"regexp"

	"github.com/chromedp/cdproto/target"
	"github.com/chromedp/chromedp"
)

func getSteamCtx(debugPort string) (context.Context, func()) {
	allocatorCtx, cancel1 := chromedp.NewRemoteAllocator(context.Background(), "http://localhost:"+debugPort)

	ctx, cancel2 := chromedp.NewContext(allocatorCtx)

	return ctx, func() {
		cancel1()
		cancel2()
	}
}

type LibraryMode string

const (
	Desktop LibraryMode = "desktop"
	Deck                = "deck"
)

func getLibraryCtx(ctx context.Context) (context.Context, *LibraryMode, error) {
	targetDesktopLibraryRe := regexp.MustCompile(`^https:\/\/steamloopback\.host\/index.html`)
	targetDeckLibraryRe := regexp.MustCompile(`^https:\/\/steamloopback\.host\/routes\/library`)

	targets, err := chromedp.Targets(ctx)
	if err != nil {
		return nil, nil, fmt.Errorf("Failed to get targets: %w", err)
	}

	var mode LibraryMode
	var libraryTarget *target.Info
	for _, target := range targets {
		fmt.Println(target)
		if match := targetDesktopLibraryRe.MatchString(target.URL); match {
			libraryTarget = target
			mode = Desktop
			break
		}
		if match := targetDeckLibraryRe.MatchString(target.URL); match {
			libraryTarget = target
			mode = Deck
			break
		}
	}
	fmt.Println("found library target mode", mode, ":", libraryTarget.URL)

	targetCtx, _ := chromedp.NewContext(ctx, chromedp.WithTargetID(libraryTarget.TargetID))
	// Don't cancel or it'll close the Steam window

	return targetCtx, &mode, nil
}

func runScriptInCtx(ctx context.Context, script string) error {
	err := chromedp.Run(ctx,
		chromedp.Evaluate(script, nil),
	)
	if err != nil {
		return fmt.Errorf("Failed to inject eval script: %w", err)
	}

	return nil
}
