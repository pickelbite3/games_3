import Config, * as UpdateConfig from "./config";
import * as Notifications from "./notifications";
import * as Caret from "./caret";
import * as TestLogic from "./test-logic";
import * as CustomText from "./custom-text";
import * as CommandlineLists from "./commandline-lists";
import * as Commandline from "./commandline";
import * as TestUI from "./test-ui";
import * as TestConfig from "./test-config";
import * as TestStats from "./test-stats";
import * as ManualRestart from "./manual-restart-tracker";
import * as Settings from "./settings";
import * as Funbox from "./funbox";

export let pageTransition = false;

export function setPageTransition(val) {
  pageTransition = val;
}

export function updateKeytips() {
  if (Config.swapEscAndTab) {
    $(".pageSettings .tip").html(`
    tip: You can also change all these settings quickly using the
    command line (
    <key>tab</key>
    )`);
    $("#bottom .keyTips").html(`
    <key>esc</key> - restart test<br>
      <key>tab</key> - command line`);
  } else {
    $(".pageSettings .tip").html(`
    tip: You can also change all these settings quickly using the
    command line (
    <key>esc</key>
    )`);
    $("#bottom .keyTips").html(`
    <key>tab</key> - restart test<br>
      <key>esc</key> or <key>ctrl/cmd</key>+<key>shift</key>+<key>p</key> - command line`);
  }
}

export function swapElements(
  el1,
  el2,
  totalDuration,
  callback = function () {
    return;
  },
  middleCallback = function () {
    return;
  }
) {
  if (
    (el1.hasClass("hidden") && !el2.hasClass("hidden")) ||
    (!el1.hasClass("hidden") && el2.hasClass("hidden"))
  ) {
    //one of them is hidden and the other is visible
    if (el1.hasClass("hidden")) {
      callback();
      return false;
    }
    $(el1)
      .removeClass("hidden")
      .css("opacity", 1)
      .animate(
        {
          opacity: 0,
        },
        totalDuration / 2,
        () => {
          middleCallback();
          $(el1).addClass("hidden");
          $(el2)
            .removeClass("hidden")
            .css("opacity", 0)
            .animate(
              {
                opacity: 1,
              },
              totalDuration / 2,
              () => {
                callback();
              }
            );
        }
      );
  } else if (el1.hasClass("hidden") && el2.hasClass("hidden")) {
    //both are hidden, only fade in the second
    $(el2)
      .removeClass("hidden")
      .css("opacity", 0)
      .animate(
        {
          opacity: 1,
        },
        totalDuration,
        () => {
          callback();
        }
      );
  } else {
    callback();
  }
}

export function changePage(page, norestart = false) {
  if (pageTransition) {
    console.log(`change page ${page} stopped`);
    return;
  }
  console.log(`change page ${page}`);
  let activePage = $(".page.active");
  $(".page").removeClass("active");
  $("#wordsInput").focusout();
  if (page == "test" || page == "") {
    setPageTransition(true);
    swapElements(
      activePage,
      $(".page.pageTest"),
      250,
      () => {
        setPageTransition(false);
        TestUI.focusWords();
        $(".page.pageTest").addClass("active");
        history.pushState(
          window.location.pathname,
          null,
          window.location.pathname
        );
      },
      () => {
        TestConfig.show();
      }
    );
    // restartCount = 0;
    // incompleteTestSeconds = 0;
    TestStats.resetIncomplete();
    ManualRestart.set();
    if (!norestart) TestLogic.restart();
    Funbox.activate(Config.funbox);
  } else if (page == "about") {
    setPageTransition(true);
    TestLogic.restart();
    swapElements(activePage, $(".page.pageAbout"), 250, () => {
      setPageTransition(false);
      history.pushState("#about", null, "#about");
      $(".page.pageAbout").addClass("active");
    });
    Funbox.activate("none");
    TestConfig.hide();
  } else if (page == "settings") {
    setPageTransition(true);
    TestLogic.restart();
    swapElements(activePage, $(".page.pageSettings"), 250, () => {
      setPageTransition(false);
      history.pushState("#settings", null, "#settings");
      $(".page.pageSettings").addClass("active");
    });
    Funbox.activate("none");
    Settings.update();
    TestConfig.hide();
  }
}

if (window.location.hostname === "localhost") {
  window.onerror = function (error) {
    Notifications.add(error, -1);
  };
  $("#top .logo .top").text("localhost");
  $("head title").text($("head title").text() + " (localhost)");
  $("body").append(
    `<div class="devIndicator tl">local</div><div class="devIndicator br">local</div>`
  );
  $(".pageSettings .discordIntegration .buttons a").attr(
    "href",
    "https://discord.com/api/oauth2/authorize?client_id=798272335035498557&redirect_uri=http%3A%2F%2Flocalhost%3A5000%2Fverify&response_type=token&scope=identify"
  );
}

//stop space scrolling
window.addEventListener("keydown", function (e) {
  if (e.keyCode == 32 && e.target == document.body) {
    e.preventDefault();
  }
});

$(".merchBanner a").click((event) => {
  $(".merchBanner").remove();
  window.localStorage.setItem("merchbannerclosed", true);
});

$(".merchBanner .fas").click((event) => {
  $(".merchBanner").remove();
  window.localStorage.setItem("merchbannerclosed", true);
  // Notifications.add(
  //   "Won't remind you anymore. Thanks for continued support <3",
  //   0,
  //   5
  // );
});

$(".scrollToTopButton").click((event) => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});

$(document).on("click", "#bottom .leftright .right .current-theme", (e) => {
  if (e.shiftKey) {
    UpdateConfig.toggleCustomTheme();
  } else {
    // if (Config.customTheme) {
    //   toggleCustomTheme();
    // }
    CommandlineLists.pushCurrent(CommandlineLists.themeCommands);
    Commandline.show();
  }
});

window.addEventListener("beforeunload", (event) => {
  // Cancel the event as stated by the standard.
  if (
    (Config.mode === "words" && Config.words < 1000) ||
    (Config.mode === "time" && Config.time < 3600) ||
    Config.mode === "quote" ||
    (Config.mode === "custom" &&
      CustomText.isWordRandom &&
      CustomText.word < 1000) ||
    (Config.mode === "custom" &&
      CustomText.isTimeRandom &&
      CustomText.time < 1000) ||
    (Config.mode === "custom" &&
      !CustomText.isWordRandom &&
      CustomText.text.length < 1000)
  ) {
    //ignore
  } else {
    if (TestLogic.active) {
      event.preventDefault();
      // Chrome requires returnValue to be set.
      event.returnValue = "";
    }
  }
});

$(window).resize(() => {
  Caret.updatePosition();
});

$(document).on("click", "#top .logo", (e) => {
  changePage("test");
});

$(document).on("click", "#top #menu .icon-button", (e) => {
  const href = $(e.currentTarget).attr("href");
  ManualRestart.set();
  changePage(href.slice(1));
});
