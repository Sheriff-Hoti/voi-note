# Release the Speech Model as soon as the app goes to the background

Spec #1 asked for the Speech Model (about 1.2 GB on the Galaxy A54) to be released after 5 minutes in the background. On the A54 no timer we can use runs that long in the background (ticket #7):

- React Native's own `setTimeout` doesn't fire in the background on Android. A 20 s timer set as the app went to the background never fired in 45 s.
- A native Android `Handler` timer (`react-native-background-timer-android`, which holds a partial wake lock) fired on time over 30 s. Over 5 minutes, Samsung's process freezer stopped it. After 330 s untouched it had not fired, and 1.14 of the app's 1.23 GB had been swapped to storage. The overdue timer then fired the moment the app came back, releasing the Speech Model just as it was needed again.

So the voice-notes core releases the Speech Model as soon as the app goes to the background, and loads it again when the app comes back. A Recording running in the background keeps it; Stop releases it if the app is still in the background. On the A54 the app's memory drops from 1.25 GB to about 0.55 GB within 10 s of going to the background (swap unchanged), and stays level over repeated release and reload cycles (about 0.54 GB in the background, 1.56 GB back in the app).

## Considered Options

- **A native background timer** (above): unreliable on Samsung, adds a native dependency and a wake lock.
- **An Android foreground service** to keep a 5-minute timer alive: a persistent notification for a notes app; out of proportion.
- **No release** (leave it to Android's freezer, swap and low-memory killer): keeps the reload off every return, but holds the memory until Android acts.

## Consequences

- Every return to the app reloads the Speech Model (about 6 s on the A54). Audio is buffered meanwhile, so a Recording started then loses nothing; its text so far appears later.
- A quick app switch (a few seconds away) costs the same reload.
- No timer is involved, so the seam tests drive it with `appStateChanged` alone.
