#include "TestKit.h"

void domainTests();
void chainTests();
void engineTests();

int main() {
    std::printf("== domain\n");
    domainTests();
    std::printf("== chain\n");
    chainTests();
    std::printf("== engine\n");
    engineTests();
    if (test::failures() > 0) {
        std::printf("%d check(s) failed\n", test::failures());
        return 1;
    }
    std::printf("all checks passed\n");
    return 0;
}
